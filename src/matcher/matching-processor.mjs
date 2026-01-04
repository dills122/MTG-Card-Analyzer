import async from "async";
import joi from "joi";
import _ from "lodash";
import { callbackify } from "node:util";
import logger from "../logger/log.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import exportProcessor from "../export-processor/index.mjs";
import imageHashing from "../image-hashing/index.mjs";

const dependencies = {
    Searcher: callbackify(scryfallApi.Search.SearchList),
    HashProcessor: exportProcessor.ProcessHashes,
    Hash: imageHashing.Hash.HashImage
};

const schema = joi.object().keys({
    name: joi.string().required(),
    filePath: joi.string().required()
});

class MatcherProcessor {
    constructor(params = {}) {
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

    execute(cb) {
        async.waterfall([(next) => this._search(next), (next) => this._processResults(next)], cb);
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
        const numCards = this.cards.length;

        if (numCards === 0) {
            this.logger.info("No results returned");
            return callback(null, 0);
        }

        if (numCards === 1) {
            this.logger.info("Exactly one result returned");
            return callback(null, this.cards[0]);
        }

        this.logger.info("Multiple results returned");
        async.waterfall(
            [(next) => this._hashLocalCard(next), (next) => this._processMultiSetMatches(next)],
            callback
        );
    }

    _hashLocalCard(callback) {
        this.logger.info(`Hashing local image ${this.filePath}`);
        dependencies.Hash(this.filePath, (err, hash) => {
            if (err) {
                return callback(err);
            }
            this.localHash = hash;
            return callback();
        });
    }

    _processMultiSetMatches(callback) {
        const processHashes = dependencies.HashProcessor.create({
            name: this.name,
            cards: this.cards,
            localHash: this.localHash,
            queryingEnabled: this.queryingEnabled,
            ignoreNoDbMatch: true,
            allowRemoteBestGuess: true
        });
        this.logger.info("Processing multi set matches");
        async.parallel(
            [
                (cb) => {
                    async.waterfall(
                        [(next) => processHashes.compareDbHashes(next), this._processHashResults],
                        cb
                    );
                },
                (cb) => {
                    async.waterfall(
                        [
                            (next) => processHashes.compareRemoteImages(next),
                            this._processHashResults
                        ],
                        cb
                    );
                }
            ],
            (err, finalResults) => {
                if (err) {
                    return callback(err);
                }
                const [db, remote] = finalResults;
                const mergedResults = _.uniq((db || []).concat(remote || []));
                this.matchResults = mergedResults;
                return callback(null, mergedResults);
            }
        );
    }

    _processHashResults(hashResults, callback) {
        if (_.isEmpty(hashResults)) {
            return callback(null, []); // No set to return
        }

        if (hashResults.length > 1) {
            return callback(null, _.map(hashResults, "setName"));
        }
        const matchObject = hashResults[0] || {};
        return callback(null, [_.get(matchObject, "setName", "")]);
    }
}

const create = (params) => new MatcherProcessor(params);

export { create, dependencies, MatcherProcessor };

export default {
    create,
    dependencies,
    MatcherProcessor
};
