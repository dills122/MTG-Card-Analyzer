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
        dependencies
            .CreateDirectory()
            .then((directory) => {
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
            })
            .catch(() => {
                return this._hashFromPath(this.filePath, callback);
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
        dependencies.CleanUpFiles(dir).catch(() => {});
    }

    _processMultiSetMatches(callback) {
        const execution = this._processMultiSetMatchesAsync();
        execution.then((results) => callback(null, results)).catch((err) => callback(err));
    }

    async _processMultiSetMatchesAsync() {
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
        const shouldQueryCache = true;
        const dbPromise = shouldQueryCache
            ? processHashes
                  .compareDbHashes()
                  .then((results) => this._processHashResults(results))
                  .catch(() => {
                      this.logger.error(
                          `DB hash lookup failed for ${this.name}; continuing with remote-only results`
                      );
                      return [];
                  })
            : Promise.resolve([]);
        const remotePromise = processHashes
            .compareRemoteImages()
            .then((results) => this._processHashResults(results));
        const [db, remote] = await Promise.all([dbPromise, remotePromise]);
        const mergedResults = _.uniq((db || []).concat(remote || []));
        this.matchResults = mergedResults;
        this.matchResultDetails = this._buildMatchDetails(mergedResults);
        return mergedResults;
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

    _processHashResults(hashResults) {
        if (_.isEmpty(hashResults)) {
            return []; // No set to return
        }

        if (hashResults.length > 1) {
            return _.map(hashResults, "setName");
        }
        const matchObject = hashResults[0] || {};
        return [_.get(matchObject, "setName", "")];
    }
}

const create = (params) => new MatcherProcessor(params);

export { create, dependencies, MatcherProcessor };

export default {
    create,
    dependencies,
    MatcherProcessor
};
