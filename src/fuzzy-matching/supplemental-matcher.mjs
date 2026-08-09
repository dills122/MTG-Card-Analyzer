import { mean, round } from "../util.mjs";

function tokenizeLetters(text, policy) {
    return (
        String(text || "")
            .toUpperCase()
            .match(/[A-Z]+/g) || []
    ).map((token) => token.slice(0, policy.supplementalEvidence.maxTokenLength));
}

function calculateEditSimilarity(left, right) {
    const row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        let diagonal = row[0];
        row[0] = leftIndex;
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            const above = row[rightIndex];
            row[rightIndex] = Math.min(
                row[rightIndex] + 1,
                row[rightIndex - 1] + 1,
                diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
            );
            diagonal = above;
        }
    }
    return 1 - row[right.length] / Math.max(left.length, right.length, 1);
}

function calculatePartialTokenSimilarity(candidateToken, evidenceToken) {
    if (candidateToken.length < 3) return candidateToken === evidenceToken ? 1 : 0;
    let best = 0;
    const minWindow = Math.max(3, candidateToken.length - 1);
    const maxWindow = candidateToken.length + 1;
    for (let windowSize = minWindow; windowSize <= maxWindow; windowSize += 1) {
        if (evidenceToken.length < windowSize) {
            best = Math.max(best, calculateEditSimilarity(candidateToken, evidenceToken));
            continue;
        }
        for (let index = 0; index <= evidenceToken.length - windowSize; index += 1) {
            best = Math.max(
                best,
                calculateEditSimilarity(
                    candidateToken,
                    evidenceToken.slice(index, index + windowSize)
                )
            );
        }
    }
    return best;
}

function bestSimilarity(candidateToken, evidenceTokens) {
    return Math.max(
        0,
        ...evidenceTokens.map((evidenceToken) =>
            calculatePartialTokenSimilarity(candidateToken, evidenceToken)
        )
    );
}

function calculateEvidenceScore(candidateName, titleTokens, supplementalTokens, policy) {
    const candidateTokens = tokenizeLetters(candidateName, policy);
    if (
        candidateTokens.length < 2 ||
        candidateTokens[0].length < policy.supplementalEvidence.minFirstTokenLength ||
        !supplementalTokens.length
    ) {
        return 0;
    }
    const firstTokenSimilarity = Math.max(
        ...supplementalTokens.map((token) => calculateEditSimilarity(candidateTokens[0], token))
    );
    if (firstTokenSimilarity < policy.supplementalEvidence.minFirstTokenSimilarity) return 0;
    const repeatedNameScore = mean(
        candidateTokens.map((candidateToken) => bestSimilarity(candidateToken, supplementalTokens))
    );
    const splitEvidenceScore = titleTokens.length
        ? mean([
              bestSimilarity(candidateTokens[0], supplementalTokens),
              ...candidateTokens
                  .slice(1)
                  .map((candidateToken) => bestSimilarity(candidateToken, titleTokens))
          ])
        : 0;
    return Math.max(repeatedNameScore >= 0.9 ? repeatedNameScore : 0, splitEvidenceScore);
}

function rankCanonicalCandidates(nameIndex, titleTokens, supplementalTokens, policy) {
    const bestByCanonicalName = new Map();
    for (const normalizedName of nameIndex.matchableNames) {
        const name = nameIndex.canonicalNameByNormalized.get(normalizedName) || normalizedName;
        const percentage = round(
            calculateEvidenceScore(normalizedName, titleTokens, supplementalTokens, policy),
            4
        );
        const current = bestByCanonicalName.get(name);
        if (!current || percentage > current.percentage) {
            bestByCanonicalName.set(name, { name, percentage });
        }
    }
    return [...bestByCanonicalName.values()]
        .sort(
            (left, right) =>
                right.percentage - left.percentage || left.name.localeCompare(right.name)
        )
        .slice(0, 2);
}

function matchSupplementalEvidence(cleanText, supplementalText, nameIndex, policy) {
    const titleTokens = [...new Set(tokenizeLetters(cleanText, policy))].slice(
        0,
        policy.supplementalEvidence.maxTitleTokens
    );
    const supplementalTokens = [...new Set(tokenizeLetters(supplementalText, policy))].slice(
        0,
        policy.supplementalEvidence.maxSupplementalTokens
    );
    const [best, runnerUp] = rankCanonicalCandidates(
        nameIndex,
        titleTokens,
        supplementalTokens,
        policy
    );
    if (!best || best.percentage < policy.supplementalEvidence.minConfidence) return [];
    if (
        runnerUp &&
        best.percentage - runnerUp.percentage < policy.supplementalEvidence.minScoreDelta
    ) {
        return [];
    }
    return [best];
}

export { matchSupplementalEvidence };

export default { matchSupplementalEvidence };
