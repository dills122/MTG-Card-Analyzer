import joi from "joi";
import { promisify } from "node:util";
import logger from "../logger/log.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import exportProcessor from "../export-processor/index.mjs";
import imageHashing from "../image-hashing/index.mjs";
import imageProcessing from "../image-processing/index.mjs";
import FileIO from "../file-io.mjs";

const dependencies = {
    Searcher: scryfallApi.Search.SearchList,
    HashProcessor: exportProcessor.ProcessHashes,
    Hash: promisify(imageHashing.Hash.HashImage),
    CreateDirectory: FileIO.CreateDirectory,
    CleanUpFiles: FileIO.CleanUpFiles,
    GetSetSymbolSnippetTmpFile: imageProcessing.resize.GetImageSnippetTmpFile
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
        this.logger.info(`matcher::search start name="${this.name}"`);
        this.cards = await dependencies.Searcher(this.name);
    }

    async _processResultsAsync() {
        const numCards = Array.isArray(this.cards) ? this.cards.length : "invalid";
        this.logger.info(`matcher::search results name="${this.name}" count=${numCards}`);
        if (!Array.isArray(this.cards)) {
            throw new Error("Error gathering results");
        }
        const totalCards = this.cards.length;

        if (totalCards === 0) {
            this.logger.info(`matcher::search no-results name="${this.name}"`);
            return 0;
        }

        if (totalCards === 1) {
            this.logger.info(`matcher::search single-result name="${this.name}"`);
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

        this.logger.info(`matcher::search multi-results name="${this.name}" count=${totalCards}`);
        await this._hashLocalCardAsync();
        return this._processMultiSetMatchesAsync();
    }

    async _hashLocalCardAsync() {
        this.logger.info(`matcher::hash local-image name="${this.name}" path="${this.filePath}"`);
        let directory;
        try {
            directory = await dependencies.CreateDirectory();
        } catch {
            return this._hashFromPathAsync(this.filePath);
        }
        this.setSymbolDirectory = directory;
        try {
            await this._hashFromSetSymbolAsync(directory);
        } catch {
            this.logger.error(
                `Set symbol crop/hash failed for ${this.filePath}; falling back to full card hash`
            );
            return this._hashFromPathAsync(this.filePath);
        }
    }

    async _hashFromSetSymbolAsync(directory) {
        this.logger.info(`matcher::hash set-symbol name="${this.name}" path="${this.filePath}"`);
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
        dependencies.CleanUpFiles(dir).catch(() => {});
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
            `matcher::hash compare-start name="${this.name}" mode=${this.hashMode || "full-card"} cardCount=${this.cards.length}`
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
        this.logger.info(
            `matcher::hash compare-complete name="${this.name}" mergedSets=${mergedResults.join(",") || "none"}`
        );
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
