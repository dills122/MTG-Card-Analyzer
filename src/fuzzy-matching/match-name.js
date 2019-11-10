const _ = require('lodash');
const async = require("async");
const joi = require("@hapi/joi");
const FuzzySet = require('fuzzyset.js');
const logger = require('../logger/log');

const config = {
    highConfidence: .95,
    minConfidence: .70,
    maxMatches: 5
};

const dependencies = {
    GetNames: require('../db-local/index').GetBulkNames
};

const schema = joi.object().keys({
    cleanText: joi.string().required(),
    dirtyText: string().optional(),
    logger: joi.object().optional()
});

class MatchName {
    constructor(params) {
        let isValid = !joi.validate(params, schema).error;
        if (!isValid) {
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
        return names.map((record) => {
            return record.name;
        });
    }

    Match(callback) {
        async.waterfall([
            (next) => this.gatherInitialResults(next),
            (next) => this.filterBulkMatches(next),
        ], callback);

    }

    gatherInitialResults(callback) {
        dependencies.GetNames((err, names) => {
            if (err) {
                return callback(err);
            }
            let filteredNames = this._filterNames(names);
            let fuzzy = FuzzySet(filteredNames);
            this.initialResults = fuzzy.get(cleanText);
            return callback();
        });
    }

    filterBulkMatches(callback) {
        let fixedResults = _.map(this.initialResults, (match) => {
            let [namePercent, nameMatch] = match;
            return {
                name: nameMatch,
                percentage: namePercent
            };
        });

        let highConfidenceMatches = _.filter(fixedResults, {
            percentage: config.highConfidence
        });

        if (highConfidenceMatches.length > 1) {
            return callback(null, highConfidenceMatches.splice(config.maxMatches + 1));
        }

        return callback(null, _.filter(fixedResults, {
            percentage: config.minConfidence
        }).splice(config.maxMatches + 1));
    }
}

module.exports = {
    create: function (params) {
        return new MatchName(params);
    },
    dependencies
};