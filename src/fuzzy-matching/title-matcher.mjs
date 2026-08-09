import FuzzySet from "fuzzyset.js";
import stringSimilarity from "string-similarity";
import { mean, orderBy, round } from "../util.mjs";
import { normalizeForMatch } from "./name-index.mjs";

function tokenize(text) {
    return String(text || "")
        .split(/\s+/g)
        .filter(Boolean);
}

function similarity(left, right) {
    if (!left || !right) return 0;
    if (left === right) return 1;
    return stringSimilarity.compareTwoStrings(left, right);
}

function calculateFirstTokenSimilarity(queryTokens, candidateTokens) {
    if (!queryTokens.length || !candidateTokens.length) return 0;
    return similarity(queryTokens[0], candidateTokens[0]);
}

function calculateTokenCoverage(queryTokens, candidateTokens) {
    if (!queryTokens.length || !candidateTokens.length) return 0;
    return mean(
        queryTokens.map(
            (queryToken) =>
                Math.max(
                    ...candidateTokens.map((candidateToken) =>
                        similarity(queryToken, candidateToken)
                    )
                ) || 0
        )
    );
}

function gatherTitleCandidates(queries, nameIndex) {
    const fuzzy = FuzzySet(nameIndex.matchableNames);
    return queries.flatMap((query) => {
        const exact = nameIndex.canonicalNameByNormalized.get(query);
        const matches = exact ? [[1, query]] : fuzzy.get(query) || [];
        return matches.map((match) => ({ match, query }));
    });
}

function scoreTitleCandidate({ match, query }, nameIndex) {
    const [namePercent, normalizedName] = match;
    const name = nameIndex.canonicalNameByNormalized.get(normalizedName) || normalizedName;
    const queryTokens = tokenize(query);
    const candidateTokens = tokenize(normalizeForMatch(name));
    const firstTokenSimilarity = calculateFirstTokenSimilarity(queryTokens, candidateTokens);
    const tokenCoverage = calculateTokenCoverage(queryTokens, candidateTokens);
    return {
        name,
        percentage: namePercent,
        score: round(namePercent * 0.6 + tokenCoverage * 0.3 + firstTokenSimilarity * 0.1, 4),
        firstTokenSimilarity,
        query,
        queryTokens
    };
}

function preferCandidate(candidate, current, minimumConfidence) {
    if (!current) return true;
    const candidateIsEligible = candidate.percentage >= minimumConfidence;
    const currentIsEligible = current.percentage >= minimumConfidence;
    return (
        (candidateIsEligible && !currentIsEligible) ||
        (candidateIsEligible === currentIsEligible &&
            (candidate.score > current.score ||
                (candidate.score === current.score && candidate.percentage > current.percentage)))
    );
}

function rankBestCandidatePerName(candidates, policy) {
    const bestByName = new Map();
    for (const candidate of candidates) {
        const current = bestByName.get(candidate.name);
        if (preferCandidate(candidate, current, policy.minConfidence)) {
            bestByName.set(candidate.name, candidate);
        }
    }
    return orderBy(
        [...bestByName.values()],
        ["score", "percentage", "name"],
        ["desc", "desc", "asc"]
    );
}

function shouldApplyDisambiguation(rankedCandidates, policy) {
    const top = rankedCandidates[0];
    return Boolean(
        top &&
        top.queryTokens.length >= 2 &&
        top.percentage >= policy.disambiguation.minTopPercent &&
        top.firstTokenSimilarity >= policy.disambiguation.minTopFirstTokenSimilarity
    );
}

function narrowCandidates(rankedCandidates, policy) {
    const best = rankedCandidates[0];
    const firstTokenSimilarityFloor = Math.max(
        policy.disambiguation.minFirstTokenSimilarity,
        best.firstTokenSimilarity - policy.disambiguation.maxFirstTokenDropFromTop
    );
    return rankedCandidates.filter(
        (candidate) =>
            candidate.score >= best.score - policy.disambiguation.maxScoreDelta &&
            candidate.firstTokenSimilarity >= firstTokenSimilarityFloor &&
            candidate.percentage >= policy.minConfidence
    );
}

function selectTitleCandidates(rankedCandidates, policy) {
    let selected;
    if (shouldApplyDisambiguation(rankedCandidates, policy)) {
        selected = narrowCandidates(rankedCandidates, policy);
    } else {
        const highConfidence = rankedCandidates.filter(
            (candidate) => candidate.percentage >= policy.highConfidence
        );
        selected =
            highConfidence.length > 1
                ? highConfidence
                : rankedCandidates.filter(
                      (candidate) => candidate.percentage >= policy.minConfidence
                  );
    }
    const capped = selected.slice(0, policy.maxMatches);
    return {
        matchedText: capped[0]?.query,
        matches: capped.map(({ name, percentage }) => ({ name, percentage }))
    };
}

function matchTitleQueries(queries, nameIndex, policy) {
    if (!queries.length || !nameIndex.matchableNames.length) {
        return { matches: [], matchedText: undefined };
    }
    const gathered = gatherTitleCandidates(queries, nameIndex);
    const scored = gathered.map((candidate) => scoreTitleCandidate(candidate, nameIndex));
    const ranked = rankBestCandidatePerName(scored, policy);
    return selectTitleCandidates(ranked, policy);
}

export { matchTitleQueries };

export default { matchTitleQueries };
