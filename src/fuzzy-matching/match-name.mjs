import _ from "lodash";
import joi from "joi";
import FuzzySet from "fuzzyset.js";
import stringSimilarity from "string-similarity";
import logger from "../logger/log.mjs";
import { cleanString } from "../util.mjs";

const config = {
    highConfidence: 0.95,
    minConfidence: 0.7,
    maxMatches: 5,
    supplementalEvidence: {
        minConfidence: 0.7,
        minScoreDelta: 0.05,
        minFirstTokenLength: 4,
        minFirstTokenSimilarity: 0.6,
        maxTokenLength: 32,
        maxTitleTokens: 32,
        maxSupplementalTokens: 160
    },
    disambiguation: {
        minTopPercent: 0.8,
        minTopFirstTokenSimilarity: 0.6,
        maxScoreDelta: 0.12,
        minFirstTokenSimilarity: 0.4,
        maxFirstTokenDropFromTop: 0.15
    }
};

async function getStoredNames() {
    const { default: storage } = await import("../storage/index.mjs");
    return storage.names.getAll();
}

const defaultDependencies = {
    GetNames: getStoredNames
};

const schema = joi.object().keys({
    cleanText: joi.string().allow("").required(),
    dirtyText: joi.string().optional(),
    supplementalText: joi.string().allow("").optional(),
    logger: joi.object().optional()
});

class MatchName {
    constructor(params = {}) {
        const { dependencies: injectedDependencies, logger: injectedLogger, ...rest } = params;
        const validatedSchema = joi.attempt(
            {
                ...rest,
                ...(injectedLogger ? { logger: injectedLogger } : {})
            },
            schema
        );
        _.assign(this, validatedSchema);
        this.dependencies = {
            ...defaultDependencies,
            ...(injectedDependencies || {})
        };
        if (!this.logger) {
            this.logger = logger.create({
                isPretty: false
            });
        }
    }

    filteredNames(names) {
        this.nameLookup = {};
        return names.map((record) => {
            const normalized = normalizeForMatch(record.name);
            this.nameLookup[normalized] = record.name;
            return normalized;
        });
    }

    async Match() {
        await this.gatherInitialResults();
        const matches = await this.filterBulkMatches();
        if (matches.length > 0 || !normalizeForMatch(this.supplementalText || "")) {
            return matches;
        }
        return this.matchSupplementalEvidence();
    }

    async gatherInitialResults() {
        const normalizedQuery = normalizeForMatch(this.cleanText);
        const hasSupplementalEvidence = Boolean(normalizeForMatch(this.supplementalText || ""));
        if (!normalizedQuery && !hasSupplementalEvidence) {
            this.nameLookup = {};
            this.initialResults = [];
            return;
        }
        const names = await this.dependencies.GetNames();
        const filteredNames = this.filteredNames(names);
        this.filteredStoredNames = [...new Set(filteredNames)];
        if (!normalizedQuery) {
            this.initialResults = [];
            return;
        }
        const fuzzy = FuzzySet(filteredNames);
        const exact = this.nameLookup[normalizedQuery];
        this.initialResults = exact ? [[1, normalizedQuery]] : fuzzy.get(normalizedQuery);
        if (!this.initialResults) {
            this.initialResults = [];
        }
    }

    async filterBulkMatches() {
        const query = normalizeForMatch(this.cleanText);
        const queryTokens = tokenize(query);
        const scoredResults = _.map(this.initialResults, (match) => {
            const [namePercent, nameMatch] = match;
            const candidateName = this.nameLookup[nameMatch] || nameMatch;
            const normalizedCandidate = normalizeForMatch(candidateName);
            const candidateTokens = tokenize(normalizedCandidate);
            const firstTokenSimilarity = calculateFirstTokenSimilarity(
                queryTokens,
                candidateTokens
            );
            const tokenCoverage = calculateTokenCoverage(queryTokens, candidateTokens);
            const score = _.round(
                namePercent * 0.6 + tokenCoverage * 0.3 + firstTokenSimilarity * 0.1,
                4
            );
            return {
                name: candidateName,
                percentage: namePercent,
                _score: score,
                _firstTokenSimilarity: firstTokenSimilarity
            };
        });
        const rankedResults = _.orderBy(
            scoredResults,
            ["_score", "percentage", "name"],
            ["desc", "desc", "asc"]
        );

        if (shouldApplyDisambiguation(queryTokens, rankedResults)) {
            const bestScore = rankedResults[0]._score;
            const bestFirstTokenSimilarity = rankedResults[0]._firstTokenSimilarity;
            const firstTokenSimilarityFloor = Math.max(
                config.disambiguation.minFirstTokenSimilarity,
                bestFirstTokenSimilarity - config.disambiguation.maxFirstTokenDropFromTop
            );
            const narrowed = rankedResults
                .filter(
                    (item) =>
                        item._score >= bestScore - config.disambiguation.maxScoreDelta &&
                        item._firstTokenSimilarity >= firstTokenSimilarityFloor &&
                        item.percentage >= config.minConfidence
                )
                .slice(0, config.maxMatches + 1);
            if (narrowed.length > 0) {
                return narrowed.map(stripInternalFields);
            }
        }

        const highConfidenceMatches = _.filter(rankedResults, (item) => {
            return item.percentage >= config.highConfidence;
        });

        if (highConfidenceMatches.length > 1) {
            return highConfidenceMatches.splice(0, config.maxMatches + 1).map(stripInternalFields);
        }

        return _.filter(rankedResults, (item) => item.percentage >= config.minConfidence)
            .splice(0, config.maxMatches + 1)
            .map(stripInternalFields);
    }

    matchSupplementalEvidence() {
        const titleTokens = [...new Set(tokenizeLetters(this.cleanText))].slice(
            0,
            config.supplementalEvidence.maxTitleTokens
        );
        const supplementalTokens = [...new Set(tokenizeLetters(this.supplementalText))].slice(
            0,
            config.supplementalEvidence.maxSupplementalTokens
        );
        const ranked = (this.filteredStoredNames || [])
            .map((normalizedName) => ({
                name: this.nameLookup[normalizedName] || normalizedName,
                percentage: _.round(
                    calculateSupplementalEvidenceScore(
                        normalizedName,
                        titleTokens,
                        supplementalTokens
                    ),
                    4
                )
            }))
            .reduce(updateTopTwoMatches, []);
        const [best, runnerUp] = ranked;
        if (!best || best.percentage < config.supplementalEvidence.minConfidence) {
            return [];
        }
        if (
            runnerUp &&
            best.percentage - runnerUp.percentage < config.supplementalEvidence.minScoreDelta
        ) {
            return [];
        }
        return [best];
    }
}

const create = (params) => new MatchName(params);

export { create, defaultDependencies as dependencies, MatchName };

export default {
    create,
    dependencies: defaultDependencies,
    MatchName
};

function normalizeForMatch(text) {
    return cleanString(text).toUpperCase().trim();
}

function tokenize(text) {
    return String(text || "")
        .split(/\s+/g)
        .filter(Boolean);
}

function similarity(left, right) {
    if (!left || !right) {
        return 0;
    }
    if (left === right) {
        return 1;
    }
    return stringSimilarity.compareTwoStrings(left, right);
}

function calculateFirstTokenSimilarity(queryTokens, candidateTokens) {
    if (!queryTokens.length || !candidateTokens.length) {
        return 0;
    }
    return similarity(queryTokens[0], candidateTokens[0]);
}

function calculateTokenCoverage(queryTokens, candidateTokens) {
    if (!queryTokens.length || !candidateTokens.length) {
        return 0;
    }
    const similarities = queryTokens.map((queryToken) => {
        return (
            _.max(
                candidateTokens.map((candidateToken) => similarity(queryToken, candidateToken))
            ) || 0
        );
    });
    return _.mean(similarities) || 0;
}

function calculateSupplementalEvidenceScore(candidateName, titleTokens, supplementalTokens) {
    const candidateTokens = tokenizeLetters(candidateName);
    if (
        candidateTokens.length < 2 ||
        candidateTokens[0].length < config.supplementalEvidence.minFirstTokenLength ||
        !supplementalTokens.length
    ) {
        return 0;
    }
    const firstTokenSimilarity = Math.max(
        ...supplementalTokens.map((token) => calculateEditSimilarity(candidateTokens[0], token))
    );
    if (firstTokenSimilarity < config.supplementalEvidence.minFirstTokenSimilarity) {
        return 0;
    }
    const bestSimilarity = (candidateToken, evidenceTokens) =>
        Math.max(
            0,
            ...evidenceTokens.map((evidenceToken) =>
                calculatePartialTokenSimilarity(candidateToken, evidenceToken)
            )
        );
    const repeatedNameScore = _.mean(
        candidateTokens.map((candidateToken) => bestSimilarity(candidateToken, supplementalTokens))
    );
    const splitEvidenceScore = titleTokens.length
        ? _.mean([
              bestSimilarity(candidateTokens[0], supplementalTokens),
              ...candidateTokens
                  .slice(1)
                  .map((candidateToken) => bestSimilarity(candidateToken, titleTokens))
          ])
        : 0;
    return Math.max(repeatedNameScore >= 0.9 ? repeatedNameScore : 0, splitEvidenceScore);
}

function tokenizeLetters(text) {
    return (
        String(text || "")
            .toUpperCase()
            .match(/[A-Z]+/g) || []
    ).map((token) => token.slice(0, config.supplementalEvidence.maxTokenLength));
}

function updateTopTwoMatches(topMatches, candidate) {
    const ranked = [...topMatches, candidate].sort(
        (left, right) => right.percentage - left.percentage || left.name.localeCompare(right.name)
    );
    return ranked.slice(0, 2);
}

function calculatePartialTokenSimilarity(candidateToken, evidenceToken) {
    if (candidateToken.length < 3) {
        return candidateToken === evidenceToken ? 1 : 0;
    }
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

function shouldApplyDisambiguation(queryTokens, rankedResults) {
    if (queryTokens.length < 2) {
        return false;
    }
    const top = rankedResults[0];
    if (!top) {
        return false;
    }
    return (
        top.percentage >= config.disambiguation.minTopPercent &&
        top._firstTokenSimilarity >= config.disambiguation.minTopFirstTokenSimilarity
    );
}

function stripInternalFields(result) {
    return {
        name: result.name,
        percentage: result.percentage
    };
}
