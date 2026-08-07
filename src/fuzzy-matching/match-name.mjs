import _ from "lodash";
import joi from "joi";
import FuzzySet from "fuzzyset.js";
import stringSimilarity from "string-similarity";
import logger from "../logger/log.mjs";
import storage from "../storage/index.mjs";
import { cleanString } from "../util.mjs";

const config = {
    highConfidence: 0.95,
    minConfidence: 0.7,
    maxMatches: 5,
    disambiguation: {
        minTopPercent: 0.8,
        minTopFirstTokenSimilarity: 0.6,
        maxScoreDelta: 0.12,
        minFirstTokenSimilarity: 0.4,
        maxFirstTokenDropFromTop: 0.15
    }
};

const dependencies = {
    GetNames: storage.names.getAll
};

const schema = joi.object().keys({
    cleanText: joi.string().required(),
    dirtyText: joi.string().optional(),
    logger: joi.object().optional()
});

class MatchName {
    constructor(params) {
        const { error: hasError } = !schema.validate(params);
        if (hasError) {
            throw new Error("Required params missing");
        }
        _.assign(this, params);
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
        return this.filterBulkMatches();
    }

    async gatherInitialResults() {
        const normalizedQuery = normalizeForMatch(this.cleanText);
        if (!normalizedQuery) {
            this.nameLookup = {};
            this.initialResults = [];
            return;
        }
        const names = await dependencies.GetNames();
        const filteredNames = this.filteredNames(names);
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
}

const create = (params) => new MatchName(params);

export { create, dependencies, MatchName };

export default {
    create,
    dependencies,
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
