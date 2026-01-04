import _ from "lodash";
import async from "async";
import joi from "joi";
import FuzzySet from "fuzzyset.js";
import logger from "../logger/log.mjs";
import dbLocal from "../db-local/index.mjs";
import { cleanString } from "../util.mjs";

const config = {
    highConfidence: 0.95,
    minConfidence: 0.7,
    maxMatches: 5
};

const dependencies = {
    GetNames: dbLocal.GetBulkNames
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

    Match(callback) {
        async.waterfall(
            [(next) => this.gatherInitialResults(next), (next) => this.filterBulkMatches(next)],
            callback
        );
    }

    gatherInitialResults(callback) {
        dependencies.GetNames((err, names) => {
            if (err) {
                return callback(err);
            }
            const filteredNames = this.filteredNames(names);
            const fuzzy = FuzzySet(filteredNames);
            const normalizedQuery = normalizeForMatch(this.cleanText);
            const exact = this.nameLookup[normalizedQuery];
            this.initialResults = exact ? [[1, normalizedQuery]] : fuzzy.get(normalizedQuery);
            if (!this.initialResults) {
                this.initialResults = [];
            }
            return callback();
        });
    }

    filterBulkMatches(callback) {
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
            return callback(null, highConfidenceMatches.splice(0, config.maxMatches + 1));
        }

        return callback(
            null,
            _.filter(fixedResults, (item) => item.percentage >= config.minConfidence).splice(
                0,
                config.maxMatches + 1
            )
        );
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
