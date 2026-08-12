import joi from "joi";
import { promisify } from "node:util";
import logger from "../logger/log.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import exportProcessor from "../export-processor/index.mjs";
import imageHashing from "../image-hashing/index.mjs";
import imageProcessing from "../image-processing/index.mjs";
import FileIO from "../file-io.mjs";

const defaultDependencies = Object.freeze({
    searchPrintings: scryfallApi.Search.searchList,
    processHashes: exportProcessor.ProcessHashes,
    hashImage: promisify(imageHashing.Hash.hashImage),
    createDirectory: FileIO.createDirectory,
    cleanUpFiles: FileIO.cleanUpFiles,
    writeSetSymbolSnippet: imageProcessing.smartCrop.writeSetSymbolSnippet
});

const schema = joi.object().keys({
    name: joi.string().required(),
    filePath: joi.string().required(),
    queryingEnabled: joi.boolean().optional(),
    logger: joi.object().optional()
});

class MatcherProcessor {
    constructor(params = {}) {
        const { dependencies: injectedDependencies, logger: injectedLogger, ...input } = params;
        const { error: hasError, value } = schema.validate(input);
        if (hasError) {
            throw new Error("Required params missing");
        }
        Object.assign(this, value);
        this.dependencies = { ...defaultDependencies, ...(injectedDependencies || {}) };
        this.logger = injectedLogger || logger.create({ isPretty: true });
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
        this.cards = await this.dependencies.searchPrintings(this.name);
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
            directory = await this.dependencies.createDirectory();
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
            const setSymbolPath = await this.dependencies.writeSetSymbolSnippet(
                this.filePath,
                directory
            );
            this.setSymbolImagePath = setSymbolPath;
            const hash = await this.dependencies.hashImage(setSymbolPath);
            this.hashMode = "set-symbol";
            this.localHash = hash;
        } finally {
            await this._cleanupSetSymbolDirectoryAsync();
        }
    }

    async _hashFromPathAsync(filePath) {
        const hash = await this.dependencies.hashImage(filePath);
        this.hashMode = "full-card";
        this.localHash = hash;
    }

    async _cleanupSetSymbolDirectoryAsync() {
        if (!this.setSymbolDirectory) {
            return;
        }
        const dir = this.setSymbolDirectory;
        this.setSymbolDirectory = "";
        try {
            await this.dependencies.cleanUpFiles(dir);
        } catch (err) {
            this.logger.error(
                `Unable to remove set-symbol temporary directory: ${err?.message || String(err)}`
            );
        }
    }

    async _processMultiSetMatchesAsync() {
        const initialHashMode = this.hashMode || "full-card";
        try {
            const initialMatches = await this._compareCurrentHashesAsync();
            if (initialMatches.length > 0 || initialHashMode !== "set-symbol") {
                return initialMatches;
            }
            this.logger.info(
                `Set-symbol comparison was inconclusive for "${this.name}"; retrying full card`
            );
        } catch (error) {
            if (initialHashMode !== "set-symbol") {
                throw error;
            }
            this.logger.error(
                `Set-symbol comparison failed for "${this.name}"; retrying full card`
            );
        }

        await this._hashFromPathAsync(this.filePath);
        return this._compareCurrentHashesAsync();
    }

    async _compareCurrentHashesAsync() {
        const processHashes = this.dependencies.processHashes.create({
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
            `Comparing ${this.cards.length} printings for "${this.name}" using ${
                this.hashMode || "full-card"
            } hashes`
        );
        const dbPromise = processHashes
            .compareDbHashes()
            .then((results) => this._processHashResults(results))
            .catch(() => {
                this.logger.error(
                    `DB hash lookup failed for ${this.name}; continuing with remote-only results`
                );
                return [];
            });
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

export { create, MatcherProcessor };

export default {
    create,
    MatcherProcessor
};
