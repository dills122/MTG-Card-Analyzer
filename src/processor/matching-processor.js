const async = require("async");
const joi = require("@hapi/joi");
const _ = require("lodash");
const {
    callbackify
} = require("util");

const logger = require('../logger/log');

const dependencies = {
    Searcher: callbackify(require("../scryfall-api/index").Search),
    HashProcessor: require("../export-results/index").ProcessHashes,
    Hash: callbackify(require("../image-hashing/index").Hash)
};

const schema = joi.object().keys({
    name: joi.string().required(),
    queryingEnabled: joi.bool().optional().default(false)

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
        async.waterfall([], cb);
    }

    _search(callback) {
        dependencies.Searcher(this.name, (err, results) => {
            if (err) {
                return callback(err);
            }
            this.cards = results;
            return callback();
        });
    }

    _processResults(callback) {
        if (!_.isArray(this.cards)) {
            return callback(new Error("Error gathering results"));
        }
        let numCards = this.cards.length;

        if (numCards === 0) {
            return callback(null, 0);
        }

        if (numCards === 1) {
            return callback(null, this.cards[0]);
        }

        async.waterfall([
            (next) => this._hashLocalCard(next),
            (next) => this._processMultiSetMatches(next)
        ], callback);
    }

    _hashLocalCard(callback) {
        dependencies.Hash((err, hash) => {
            if (err) {
                return callback(err);
            }
            this.localHash = hash;
            return callback();
        });
    }

    _processMultiSetMatches(callback) {
        let processHashes = ProcessHashes.create({
            name: this.name,
            cards: this.cards,
            localHash: this.localHash,
            queryingEnabled: this.queryingEnabled
        });

        async.parallel([
            async () => processHashes.compareDbHashes,
            async () => processHashes.compareRemoteImages
        ], (err, hashResults) => {
            if(err) {
                return callback(err);
            }
            this._processHashResults(hashResults, callback);
        });
    }

    _processHashResults(hashResults, callback) {
        //TODO check hash comparison results
    }
}

module.exports = {
    create: function (params) {
        return new MatcherProcessor(params);
    },
    dependencies
}