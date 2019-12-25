const async = require("async");
const joi = require("@hapi/joi");
const _ = require("lodash");
const {
    callbackify
} = require("util");

const logger = require('../logger/log');

const dependencies = {
    Searcher: callbackify(require("../scryfall-api/index").Search.SearchList),
    HashProcessor: require("../export-results/index").ProcessHashes,
    Hash: require("../image-hashing/").Hash.HashImage
};

const schema = joi.object().keys({
    name: joi.string().required(),
    filePath: joi.string().required()

});

class MatcherProcessor {
    constructor(params = {}) {
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

    execute(cb) {
        async.waterfall([
            (next) => this._search(next),
            (next) => this._processResults(next)
        ], cb);
    }

    _search(callback) {
        this.logger.info(`Beginning card search ${this.name}`);
        dependencies.Searcher(this.name, (err, results) => {
            if (err) {
                return callback(err);
            }
            this.cards = results;
            return callback();
        });
    }

    _processResults(callback) {
        this.logger.info("Checking search results");
        if (!_.isArray(this.cards)) {
            return callback(new Error("Error gathering results"));
        }
        let numCards = this.cards.length;

        if (numCards === 0) {
            this.logger.info("No results returned");
            return callback(null, 0);
        }

        if (numCards === 1) {
            this.logger.info("Exactly one result returned");
            return callback(null, this.cards[0]);
        }

        this.logger.info("Multiple results returned");
        async.waterfall([
            (next) => this._hashLocalCard(next),
            (next) => this._processMultiSetMatches(next)
        ], callback);
    }

    _hashLocalCard(callback) {
        this.logger.info(`Hashing local image ${this.filePath}`)
        dependencies.Hash(this.filePath, (err, hash) => {
            if (err) {
                return callback(err);
            }
            this.localHash = hash;
            return callback();
        });
    }

    _processMultiSetMatches(callback) {
        let processHashes = dependencies.HashProcessor.create({
            name: this.name,
            cards: this.cards,
            localHash: this.localHash,
            queryingEnabled: this.queryingEnabled
        });
        this.logger.info("Processing multi set matches");
        async.parallel([
            (cb) => {
                async.waterfall([
                    (next) => processHashes.compareDbHashes(next),
                    this._processHashResults
                ], cb);
            },
            (cb) => {
                async.waterfall([
                    (next) => processHashes.compareRemoteImages(next),
                    this._processHashResults
                ], cb);
            }
        ], (err, finalResults) => {
            if (err) {
                return callback(err);
            }
            let [db, remote] = finalResults;
            let mergedResults = db.concat(remote);
            this.matchResults = new Set(mergedResults);

            return callback(null, this.matchResults);
        });
    }

    _processHashResults(hashResults, callback) {
        if (_.isEmpty(hashResults)) {
            return callback(null, []); //No set to return
        }

        if (hashResults.length > 1) {
            return callback(null, _.map(hashResults, "setName"));
        }
        let matchObject = hashResults[0] || {};
        return callback(null, [_.get(matchObject, "setName", "")]);
    }
}

module.exports = {
    create: function (params) {
        return new MatcherProcessor(params);
    },
    dependencies
}