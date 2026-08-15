import path from "node:path";
import { randomUUID } from "node:crypto";
import logger from "../logger/log.mjs";
import joi from "joi";
import storage from "../storage/index.mjs";
import imageHashing from "../image-hashing/index.mjs";
import imageProcessing from "../image-processing/index.mjs";
import FileIO from "../file-io.mjs";
import { round, orderBy, omit } from "../util.mjs";
import { normalizePrintCandidate } from "../matcher/print-candidate.mjs";

const config = {
    remoteBestGuess: {
        maxCandidates: 3,
        minSimilarity: 0.75,
        maxSimilarityDeltaFromTop: 0.03
    }
};

const setSymbolHashModes = new Set(["set-symbol", imageProcessing.smartCrop.setSymbolHashMode]);

function isSetSymbolHashMode(hashMode) {
    return setSymbolHashModes.has(hashMode);
}

const defaultDependencies = {
    CardHashes: storage.hashes,
    Hash: imageHashing.Hash,
    createDirectory: FileIO.createDirectory,
    cleanUpFiles: FileIO.cleanUpFiles,
    CropSetSymbol: imageProcessing.smartCrop.cropSetSymbolFromImage,
    readImage: imageProcessing.util.readImage
};

const schema = joi.object().keys({
    cards: joi.array().min(1).required(),
    localHash: joi.string().min(1).required(),
    name: joi.string().required(),
    queryingEnabled: joi.boolean().optional().default(false),
    ignoreNoDbMatch: joi.boolean().optional().default(false),
    allowRemoteBestGuess: joi.boolean().optional().default(false),
    hashMode: joi
        .string()
        .optional()
        .valid("full-card", ...setSymbolHashModes)
        .default("full-card")
});

class ProcessHashes {
    constructor(params = {}) {
        const { dependencies, logger: injectedLogger, ...rest } = params;
        const validatedSchema = joi.attempt(rest, schema);
        Object.assign(this, validatedSchema);
        this.dependencies = {
            ...defaultDependencies,
            ...(dependencies || {})
        };
        this.logger =
            injectedLogger ||
            logger.create({
                isPretty: false
            });
    }

    async compareDbHashes() {
        this.logger.info(`Checking local hash cache for "${this.name}"`);
        const hashMode = this.hashMode || "full-card";
        const allHashes = await this.dependencies.CardHashes.getByCardName(this.name);
        // A stored hash computed in a different mode (full-card vs set-symbol) measures something
        // different than this.localHash -- comparing across modes is apples-to-oranges, so treat
        // a mode mismatch as "no usable cached hash," not "compare it anyway."
        const hashes = allHashes.filter((dbHash) => (dbHash.hashMode || "full-card") === hashMode);
        const skippedForModeMismatch = allHashes.length - hashes.length;
        if (skippedForModeMismatch > 0) {
            this.logger.info(
                `Skipped ${skippedForModeMismatch} cached hash(es) for "${this.name}": hashMode mismatch (expected ${hashMode})`
            );
        }
        const matches = [];
        hashes.forEach((dbHash) => {
            const compareResults = this.dependencies.Hash.compareHash(
                this.localHash,
                dbHash.cardHash
            );
            if (compareResults.matches) {
                matches.push(
                    Object.assign(compareResults, {
                        ...normalizePrintCandidate(dbHash),
                        setName: dbHash.setName,
                        hashMode,
                        matchKind:
                            hashMode === "full-card"
                                ? "cache-full-card-hash"
                                : "cache-set-symbol-hash",
                        // Legacy cache rows identify only a set name. They remain useful hints,
                        // but cannot prove an exact printing until refreshed with a print ID.
                        verified: Boolean(dbHash.printId) && hashMode === "full-card"
                    })
                );
            }
        });
        this.logger.info(`Local hash cache matches for "${this.name}": ${matches.length}`);
        if (matches.length === 0) {
            if (this.ignoreNoDbMatch) {
                return [];
            }
            throw new Error("No Matches Found");
        }
        return matches;
    }

    async compareRemoteImages() {
        const imageLabel = this.cards.length === 1 ? "image" : "images";
        this.logger.info(
            `Comparing ${this.cards.length} Scryfall ${imageLabel} for "${this.name}" (${this.hashMode})`
        );
        const cards = this.cards.map((card) => {
            const printing = normalizePrintCandidate(card);
            return {
                imgUrl: printing.imageUrl,
                printing
            };
        });
        const comparisonResultsList = [];
        const { tempDirectory, done } = await this._withRemoteHashDirectory();
        try {
            const hashResults = await Promise.all(
                cards.map(async (card) => {
                    const remoteImageHash = await this._hashRemoteForComparison(
                        card.imgUrl,
                        tempDirectory
                    );
                    return {
                        printing: card.printing,
                        remoteImageHash
                    };
                })
            );
            for (const { printing, remoteImageHash } of hashResults) {
                if (!remoteImageHash) {
                    continue;
                }
                try {
                    await this._insertCardHash(printing, remoteImageHash);
                } catch (err) {
                    // Hashes are a reusable cache, not collection truth. Wait for the
                    // attempted write so process exit cannot drop it, but keep a cache
                    // failure from failing an otherwise valid scan.
                    this.logger.error(
                        `Card-hash cache write failed for "${this.name}" (${printing.setName}): ${
                            err?.message || String(err)
                        }`
                    );
                }
                const comparisonResults = this.dependencies.Hash.compareHash(
                    this.localHash,
                    remoteImageHash
                );
                if (comparisonResults.comparable) {
                    comparisonResultsList.push(
                        Object.assign(comparisonResults, {
                            ...printing,
                            hashMode: this.hashMode,
                            matchKind:
                                this.hashMode === "full-card"
                                    ? "remote-full-card-hash"
                                    : "remote-set-symbol-hash",
                            // A set symbol can verify a set, not a collector-number variant.
                            verified: this.hashMode === "full-card"
                        })
                    );
                }
            }
        } finally {
            await done();
        }
        let bestMatches = comparisonResultsList.filter((match) => match.matches);
        if (
            this.allowRemoteBestGuess &&
            bestMatches.length === 0 &&
            comparisonResultsList.length > 0
        ) {
            const sortedByScore = orderBy(
                comparisonResultsList
                    .filter(
                        (match) =>
                            match.eligible !== false &&
                            match.similarity >= config.remoteBestGuess.minSimilarity
                    )
                    .map((match) => ({
                        ...match,
                        confidenceScore: round(match.similarity, 4)
                    })),
                ["confidenceScore", "minQuality", "distance"],
                ["desc", "desc", "asc"]
            );
            if (sortedByScore.length > 0) {
                const topScore = sortedByScore[0].confidenceScore;
                bestMatches = sortedByScore
                    .filter(
                        (match) =>
                            topScore - match.confidenceScore <=
                            config.remoteBestGuess.maxSimilarityDeltaFromTop
                    )
                    .slice(0, config.remoteBestGuess.maxCandidates)
                    .map((match) => ({
                        ...omit(match, ["confidenceScore"]),
                        matchKind: "remote-image-best-guess",
                        verified: false
                    }));
                this.logger.info(
                    `Using closest image matches for "${this.name}": ${bestMatches
                        .map((match) => match.setName)
                        .join(", ")}`
                );
            } else {
                this.logger.info(
                    `Closest image matches for "${this.name}" were below the quality or similarity floor`
                );
            }
        }
        this.logger.info(`Scryfall image matches for "${this.name}": ${bestMatches.length}`);
        return bestMatches;
    }

    async _withRemoteHashDirectory() {
        if (!isSetSymbolHashMode(this.hashMode)) {
            return {
                tempDirectory: "",
                done: () => {}
            };
        }
        const directory = await this.dependencies.createDirectory();
        return {
            tempDirectory: directory,
            done: async () => {
                try {
                    await this.dependencies.cleanUpFiles(directory);
                } catch (err) {
                    this.logger.error(
                        `Unable to remove remote-hash temporary directory: ${
                            err?.message || String(err)
                        }`
                    );
                }
            }
        };
    }

    async _hashRemoteForComparison(url, tempDirectory) {
        if (!isSetSymbolHashMode(this.hashMode)) {
            return this._hashImage(url);
        }
        try {
            return await this._hashRemoteSetSymbol(url, tempDirectory);
        } catch (error) {
            this.logger.error(
                `Remote set-symbol hash failed for "${this.name}"; full-card retry required`
            );
            throw error;
        }
    }

    async _hashRemoteSetSymbol(url, tempDirectory) {
        const image = await this.dependencies.readImage(
            url,
            imageHashing.isRemoteUrl(url)
                ? { headers: imageHashing.REMOTE_IMAGE_REQUEST_HEADERS }
                : undefined
        );
        const cropped = this.dependencies.CropSetSymbol(image);
        if (cropped.lowConfidence) {
            throw new Error(`Set symbol crop is low confidence: ${cropped.reason}`);
        }
        const tmpFilePath = path.join(tempDirectory, `${randomUUID()}.png`);
        await cropped.image.write(tmpFilePath);
        return this._hashImage(tmpFilePath);
    }

    // Promisifies dependencies.Hash.hashImage at call time (not once at module load) so tests
    // that sandbox.stub(Hash, "HashImage") after this class is defined keep working -- same
    // dynamic-dispatch reasoning as src/storage/adapters/create-callback-adapter.mjs.
    _hashImage(url) {
        return new Promise((resolve, reject) => {
            this.dependencies.Hash.hashImage(url, (err, hash) => {
                if (err) {
                    return reject(err);
                }
                return resolve(hash);
            });
        });
    }

    async _insertCardHash(printing, hash) {
        const candidate = normalizePrintCandidate(printing);
        return this.dependencies.CardHashes.upsert({
            cardName: this.name,
            printId: candidate.printId,
            oracleId: candidate.oracleId,
            setCode: candidate.setCode,
            setName: candidate.setName,
            collectorNumber: candidate.collectorNumber,
            language: candidate.language,
            illustrationId: candidate.illustrationId,
            cardUrl: candidate.imageUrl,
            scryfallUri: candidate.scryfallUri,
            cardHash: hash,
            hashMode: this.hashMode
        });
    }
}

const create = (params) => new ProcessHashes(params);
ProcessHashes.create = create;

export { create, ProcessHashes };

export default {
    create,
    ProcessHashes
};
