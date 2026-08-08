import joi from "joi";
import { promisify } from "node:util";
import logger from "../logger/log.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import exportProcessor from "../export-processor/index.mjs";
import imageHashing from "../image-hashing/index.mjs";
import imageProcessing from "../image-processing/index.mjs";
import FileIO from "../file-io.mjs";

const dependencies = {
    Searcher: scryfallApi.Search.searchList,
    HashProcessor: exportProcessor.ProcessHashes,
    Hash: promisify(imageHashing.Hash.hashImage),
    createDirectory: FileIO.createDirectory,
    cleanUpFiles: FileIO.cleanUpFiles,
    GetSetSymbolSnippetTmpFile: imageProcessing.resize.getImageSnippetTmpFile
};

const schema = joi.object().keys({
    name: joi.string().required(),
    filePath: joi.string().required(),
    queryingEnabled: joi.boolean().optional(),
    logger: joi.object().optional()
});

class MatcherProcessor {
    constructor(params = {}) {
        const { error: hasError } = schema.validate(params);
        if (hasError) {
            throw new Error("Required params missing");
        }
        Object.assign(this, params);
        if (!this.logger) {
            this.logger = logger.create({
                isPretty: true
            });
        }
    }

    execute(callback) {
        const execution = this.executeAsync();
        if (typeof callback === "function") {
            execution.then((result) => callback(null, result)).catch((err) => callback(err));
            return;
        }
        return execution;
    }

    async executeAsync() {
        await this._searchAsync();
        return this._processResultsAsync();
    }

    async _searchAsync() {
        this.logger.info(`Searching Scryfall for "${this.name}"`);
        this.cards = await dependencies.Searcher(this.name);
    }

    async _processResultsAsync() {
        if (!Array.isArray(this.cards)) {
            this.logger.error(`Scryfall response for "${this.name}" was not a printing list`);
            throw new Error("Error gathering results");
        }
        const totalCards = this.cards.length;
        const printingLabel = totalCards === 1 ? "printing" : "printings";
        this.logger.info(`Scryfall returned ${totalCards} ${printingLabel} for "${this.name}"`);

        if (totalCards === 0) {
            return 0;
        }

        if (totalCards === 1) {
            const single = this.cards[0] || {};
            const setName = single.set_name ?? "";
            this.matchResultDetails = [
                {
                    setName,
                    scryfallUri: single.scryfall_uri || single.uri || ""
                }
            ];
            return setName ? [setName] : [];
        }

        await this._hashLocalCardAsync();
        return this._processMultiSetMatchesAsync();
    }

    async _hashLocalCardAsync() {
        let directory;
        try {
            directory = await dependencies.createDirectory();
        } catch {
            return this._hashFromPathAsync(this.filePath);
        }
        this.setSymbolDirectory = directory;
        try {
            await this._hashFromSetSymbolAsync(directory);
        } catch {
            this.logger.error(`Set-symbol hash failed for "${this.name}"; using full card image`);
            return this._hashFromPathAsync(this.filePath);
        }
    }

    async _hashFromSetSymbolAsync(directory) {
        this.logger.info(`Hashing set symbol for "${this.name}"`);
        try {
            const setSymbolPath = await dependencies.GetSetSymbolSnippetTmpFile(
                this.filePath,
                directory,
                "set-symbol"
            );
            this.setSymbolImagePath = setSymbolPath;
            const hash = await dependencies.Hash(setSymbolPath);
            this.hashMode = "set-symbol";
            this.localHash = hash;
        } finally {
            this._cleanupSetSymbolDirectory();
        }
    }

    async _hashFromPathAsync(filePath) {
        const hash = await dependencies.Hash(filePath);
        this.hashMode = "full-card";
        this.localHash = hash;
    }

    _cleanupSetSymbolDirectory() {
        if (!this.setSymbolDirectory) {
            return;
        }
        const dir = this.setSymbolDirectory;
        this.setSymbolDirectory = "";
        dependencies.cleanUpFiles(dir).catch(() => {});
    }

    async _processMultiSetMatchesAsync() {
        const processHashes = dependencies.HashProcessor.create({
            name: this.name,
            cards: this.cards,
            localHash: this.localHash,
            hashMode: this.hashMode || "full-card",
            logger: this.logger,
            queryingEnabled: this.queryingEnabled,
            ignoreNoDbMatch: true,
            allowRemoteBestGuess: true
        });
        this.logger.info(
            `Comparing ${this.cards.length} printings for "${this.name}" using ${this.hashMode || "full-card"} hashes`
        );
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
        const mergedResults = [...new Set((db || []).concat(remote || []))];
        this.matchResults = mergedResults;
        this.matchResultDetails = this._buildMatchDetails(mergedResults);
        this.logger.info(`Print matches for "${this.name}": ${mergedResults.join(", ") || "none"}`);
        return mergedResults;
    }

    _buildMatchDetails(setNames = []) {
        const cardBySet = new Map();
        (this.cards || []).forEach((card) => {
            const setName = card.set_name ?? "";
            if (!setName || cardBySet.has(setName)) {
                return;
            }
            cardBySet.set(setName, {
                setName,
                scryfallUri: card.scryfall_uri || card.uri || ""
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
        if (!hashResults || hashResults.length === 0) {
            return []; // No set to return
        }

        if (hashResults.length > 1) {
            return hashResults.map((result) => result.setName);
        }
        const matchObject = hashResults[0] || {};
        return [matchObject.setName ?? ""];
    }
}

const create = (params) => new MatcherProcessor(params);

export { create, dependencies, MatcherProcessor };

export default {
    create,
    dependencies,
    MatcherProcessor
};
