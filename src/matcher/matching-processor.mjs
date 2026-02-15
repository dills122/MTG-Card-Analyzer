import async from "async";
import joi from "joi";
import _ from "lodash";
import { callbackify } from "node:util";
import logger from "../logger/log.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import exportProcessor from "../export-processor/index.mjs";
import imageHashing from "../image-hashing/index.mjs";
import imageProcessing from "../image-processing/index.mjs";
import FileIO from "../file-io.mjs";

const dependencies = {
    Searcher: callbackify(scryfallApi.Search.SearchList),
    HashProcessor: exportProcessor.ProcessHashes,
    Hash: imageHashing.Hash.HashImage,
    CreateDirectory: FileIO.CreateDirectory,
    CleanUpFiles: FileIO.CleanUpFiles,
    GetSetSymbolSnippetTmpFile: imageProcessing.resize.GetImageSnippetTmpFile
};

const schema = joi.object().keys({
    name: joi.string().required(),
    filePath: joi.string().required(),
    queryingEnabled: joi.boolean().optional()
});

class MatcherProcessor {
    constructor(params = {}) {
        const { error: hasError } = schema.validate(params);
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
        dependencies.CreateDirectory((dirErr, directory) => {
            if (dirErr) {
                return this._hashFromPath(this.filePath, callback);
            }
            this.setSymbolDirectory = directory;
            this._hashFromSetSymbol(directory, (hashErr) => {
                if (hashErr) {
                    this.logger.error(
                        `Set symbol crop/hash failed for ${this.filePath}; falling back to full card hash`
                    );
                    return this._hashFromPath(this.filePath, callback);
                }
                return callback();
            });
        });
    }

    _hashFromSetSymbol(directory, callback) {
        this.logger.info(`Hashing set symbol image ${this.filePath}`);
        dependencies
            .GetSetSymbolSnippetTmpFile(this.filePath, directory, "set-symbol")
            .then((setSymbolPath) => {
                this.setSymbolImagePath = setSymbolPath;
                dependencies.Hash(setSymbolPath, (err, hash) => {
                    this._cleanupSetSymbolDirectory();
                    if (err) {
                        return callback(err);
                    }
                    this.hashMode = "set-symbol";
                    this.localHash = hash;
                    return callback();
                });
            })
            .catch((err) => {
                this._cleanupSetSymbolDirectory();
                return callback(err);
            });
    }

    _hashFromPath(filePath, callback) {
        dependencies.Hash(filePath, (err, hash) => {
            if (err) {
                return callback(err);
            }
            this.hashMode = "full-card";
            this.localHash = hash;
            return callback();
        });
    }

    _cleanupSetSymbolDirectory() {
        if (!this.setSymbolDirectory) {
            return;
        }
        const dir = this.setSymbolDirectory;
        this.setSymbolDirectory = "";
        dependencies.CleanUpFiles(dir, () => {});
    }

    _processMultiSetMatches(callback) {
        const processHashes = dependencies.HashProcessor.create({
            name: this.name,
            cards: this.cards,
            localHash: this.localHash,
            hashMode: this.hashMode || "full-card",
            queryingEnabled: this.queryingEnabled,
            ignoreNoDbMatch: true,
            allowRemoteBestGuess: true
        });
        this.logger.info("Processing multi set matches");
        const shouldQueryDb = Boolean(this.queryingEnabled);
        async.parallel(
            [
                (cb) => {
                    if (!shouldQueryDb) {
                        return cb(null, []);
                    }
                    async.waterfall(
                        [(next) => processHashes.compareDbHashes(next), this._processHashResults],
                        (err, results) => {
                            if (err) {
                                this.logger.error(
                                    `DB hash lookup failed for ${this.name}; continuing with remote-only results`
                                );
                                return cb(null, []);
                            }
                            return cb(null, results);
                        }
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
                this.matchResultDetails = this._buildMatchDetails(mergedResults);
                return callback(null, mergedResults);
            }
        );
    }

    _buildMatchDetails(setNames = []) {
        const cardBySet = new Map();
        (this.cards || []).forEach((card) => {
            const setName = _.get(card, "set_name", "");
            if (!setName || cardBySet.has(setName)) {
                return;
            }
            cardBySet.set(setName, {
                setName,
                scryfallUri: _.get(card, "scryfall_uri", "") || _.get(card, "uri", "")
            });
        });

        return setNames.map((setName) => {
            const matchDetail = cardBySet.get(setName);
            return (
                matchDetail || {
                    setName,
                    scryfallUri: ""
                }
            );
        });
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
