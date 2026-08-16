import joi from "joi";
import { promisify } from "node:util";
import logger from "../logger/log.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import exportProcessor from "../export-processor/index.mjs";
import imageHashing from "../image-hashing/index.mjs";
import imageProcessing from "../image-processing/index.mjs";
import FileIO from "../file-io.mjs";
import { normalizePrintCandidate, printIdentityKey } from "./print-candidate.mjs";

const defaultDependencies = Object.freeze({
    searchPrintings: scryfallApi.Search.searchList,
    processHashes: exportProcessor.ProcessHashes,
    hashImage: promisify(imageHashing.Hash.hashImage),
    createDirectory: FileIO.createDirectory,
    cleanUpFiles: FileIO.cleanUpFiles,
    writeSetSymbolSnippet: imageProcessing.smartCrop.writeSetSymbolSnippet
});

const nonstandardSetSymbolLayouts = new Set(["flip", "meld", "planar", "saga", "split"]);

function nonstandardLayoutSummary(cards = []) {
    const candidates = cards.map(normalizePrintCandidate);
    if (
        candidates.length === 0 ||
        candidates.some(
            (candidate) => !candidate.layout || !nonstandardSetSymbolLayouts.has(candidate.layout)
        )
    ) {
        return "";
    }
    return [...new Set(candidates.map((candidate) => candidate.layout))].sort().join(", ");
}

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
            const printing = normalizePrintCandidate(single);
            this.matchResultDetails = [
                {
                    ...printing,
                    matchKind: "catalog-candidate-only",
                    verified: false
                }
            ];
            return printing.setName ? [printing.setName] : [];
        }

        await this._hashLocalCardAsync();
        return this._processMultiSetMatchesAsync();
    }

    async _hashLocalCardAsync() {
        const layoutSummary = nonstandardLayoutSummary(this.cards);
        if (layoutSummary) {
            this.logger.info(
                `All printings for "${this.name}" use nonstandard layouts (${layoutSummary}); using full card image`
            );
            return this._hashFromPathAsync(this.filePath);
        }

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
            this.hashMode = imageProcessing.smartCrop.setSymbolHashMode;
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
            if (
                initialMatches.length > 0 ||
                initialHashMode !== imageProcessing.smartCrop.setSymbolHashMode
            ) {
                return initialMatches;
            }
            this.logger.info(
                `Set-symbol comparison was inconclusive for "${this.name}"; retrying full card`
            );
        } catch (error) {
            if (initialHashMode !== imageProcessing.smartCrop.setSymbolHashMode) {
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
        const mergedDetails = this._mergeMatchDetails((db || []).concat(remote || []));
        const setNames = [
            ...new Set(mergedDetails.map((detail) => detail.setName).filter(Boolean))
        ];
        this.matchResults = mergedDetails;
        this.matchResultDetails = mergedDetails;
        this.logger.info(`Print matches for "${this.name}": ${setNames.join(", ") || "none"}`);
        return setNames;
    }

    _mergeMatchDetails(details = []) {
        const byPrint = new Map();
        details.forEach((detail) => {
            const key = printIdentityKey(detail);
            const existing = byPrint.get(key);
            if (!existing || (!existing.verified && detail.verified)) {
                byPrint.set(key, detail);
            }
        });
        return [...byPrint.values()];
    }

    _processHashResults(hashResults) {
        if (!hashResults || hashResults.length === 0) {
            return [];
        }
        return hashResults.map((result) => {
            const printing = normalizePrintCandidate(result);
            return {
                ...printing,
                comparison: {
                    comparable: Boolean(result.comparable),
                    algorithm: String(result.algorithm || ""),
                    similarity: Number(result.similarity) || 0,
                    distance: Number.isFinite(result.distance) ? Number(result.distance) : null,
                    bitLength: Number(result.bitLength) || 0,
                    leftQuality: Number.isFinite(result.leftQuality)
                        ? Number(result.leftQuality)
                        : null,
                    rightQuality: Number.isFinite(result.rightQuality)
                        ? Number(result.rightQuality)
                        : null,
                    minQuality: Number.isFinite(result.minQuality)
                        ? Number(result.minQuality)
                        : null,
                    eligible: result.eligible !== false,
                    matches: Boolean(result.matches),
                    reason: String(result.reason || "")
                },
                hashMode: result.hashMode || this.hashMode || "full-card",
                matchKind: result.matchKind || "legacy-set-hash",
                verified: Boolean(result.verified)
            };
        });
    }
}

const create = (params) => new MatcherProcessor(params);

export { create, MatcherProcessor };

export default {
    create,
    MatcherProcessor
};
