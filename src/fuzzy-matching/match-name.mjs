import _ from "lodash";
import joi from "joi";
import FuzzySet from "fuzzyset.js";
import logger from "../logger/log.mjs";
import { cleanString } from "../util.mjs";

const config = {
    highConfidence: 0.95,
    minConfidence: 0.7,
    maxMatches: 5
};

async function getStoredNames() {
    const { default: storage } = await import("../storage/index.mjs");
    return storage.names.getAll();
}

const defaultDependencies = {
    GetNames: getStoredNames
};

const schema = joi.object().keys({
    cleanText: joi.string().required(),
    dirtyText: joi.string().optional(),
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
        return this.filterBulkMatches();
    }

    async gatherInitialResults() {
        const names = await this.dependencies.GetNames();
        const filteredNames = this.filteredNames(names);
        const fuzzy = FuzzySet(filteredNames);
        const normalizedQuery = normalizeForMatch(this.cleanText);
        const exact = this.nameLookup[normalizedQuery];
        this.initialResults = exact ? [[1, normalizedQuery]] : fuzzy.get(normalizedQuery);
        if (!this.initialResults) {
            this.initialResults = [];
        }
    }

    async filterBulkMatches() {
        const fixedResults = _.map(this.initialResults, (match) => {
            const [namePercent, nameMatch] = match;
            return {
                name: this.nameLookup[nameMatch] || nameMatch,
                percentage: namePercent
            };
        });

        const highConfidenceMatches = _.filter(fixedResults, (item) => {
            return item.percentage >= config.highConfidence;
        });

        if (highConfidenceMatches.length > 1) {
            return highConfidenceMatches.splice(0, config.maxMatches + 1);
        }

        return _.filter(fixedResults, (item) => item.percentage >= config.minConfidence).splice(
            0,
            config.maxMatches + 1
        );
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
