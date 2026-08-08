import path from "node:path";
import { randomUUID } from "node:crypto";
import jimp from "jimp";
import logger from "../logger/log.mjs";
import joi from "joi";
import storage from "../storage/index.mjs";
import imageHashing from "../image-hashing/index.mjs";
import FileIO from "../file-io.mjs";
import { round, clamp, orderBy, omit } from "../util.mjs";

const config = {
    remoteMatch: {
        twoBit: 0.75,
        fourBit: 0.7,
        stringCompare: 0.75
    },
    remoteBestGuess: {
        maxCandidates: 3,
        minScoreDeltaFromTop: 0.03
    },
    dbMatch: {
        twoBit: 0.92,
        fourBit: 0.85,
        stringCompare: 0.92
    }
};

const defaultDependencies = {
    CardHashes: storage.hashes,
    Hash: imageHashing.Hash,
    createDirectory: FileIO.createDirectory,
    cleanUpFiles: FileIO.cleanUpFiles
};

const schema = joi.object().keys({
    cards: joi.array().min(1).required(),
    localHash: joi.string().min(1).required(),
    name: joi.string().required(),
    queryingEnabled: joi.boolean().optional().default(false),
    ignoreNoDbMatch: joi.boolean().optional().default(false),
    allowRemoteBestGuess: joi.boolean().optional().default(false),
    hashMode: joi.string().optional().valid("full-card", "set-symbol").default("full-card")
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
        const hashes = await this.dependencies.CardHashes.getByCardName(this.name);
        const matches = [];
        hashes.forEach((dbHash) => {
            const compareResults = this.dependencies.Hash.compareHash(
                this.localHash,
                dbHash.cardHash
            );
            const isMatch =
                compareResults.twoBitMatches >= config.dbMatch.twoBit &&
                compareResults.fourBitMatches >= config.dbMatch.fourBit &&
                compareResults.stringCompare >= config.dbMatch.stringCompare;
            if (isMatch) {
                matches.push(
                    Object.assign(compareResults, {
                        setName: dbHash.setName
                    })
                );
            }
        });
        this.logger.info(`Local hash cache matches for "${this.name}": ${matches.length}`);
        if (matches.length === 0) {
            if (this.ignoreNoDbMatch) {
                return [];
            }
            throw {
                error: "No Matches Found"
            };
        }
        return matches;
    }

    async compareRemoteImages() {
        const imageLabel = this.cards.length === 1 ? "image" : "images";
        this.logger.info(
            `Comparing ${this.cards.length} Scryfall ${imageLabel} for "${this.name}" (${this.hashMode})`
        );
        const cards = this.cards.map((card) => {
            const images = card.image_uris || {};
            return {
                imgUrl: images.normal || images.large,
                setName: card.set_name
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
                        setName: card.setName,
                        remoteImageHash
                    };
                })
            );
            hashResults.forEach(({ setName, remoteImageHash }) => {
                this._insertCardHash(setName, remoteImageHash);
                const comparisonResults = this.dependencies.Hash.compareHash(
                    this.localHash,
                    remoteImageHash
                );
                if (Object.keys(comparisonResults).length > 0) {
                    comparisonResultsList.push(
                        Object.assign(comparisonResults, {
                            setName
                        })
                    );
                }
            });
        } finally {
            done();
        }
        const matchValues = config.remoteMatch;
        let bestMatches = comparisonResultsList.filter((match) => {
            return (
                match.twoBitMatches >= matchValues.twoBit &&
                match.fourBitMatches >= matchValues.fourBit &&
                match.stringCompare >= matchValues.stringCompare
            );
        });
        if (
            this.allowRemoteBestGuess &&
            bestMatches.length === 0 &&
            comparisonResultsList.length > 0
        ) {
            const sortedByScore = orderBy(
                comparisonResultsList.map((match) => ({
                    ...match,
                    confidenceScore: round(
                        match.stringCompare * 0.5 +
                            match.twoBitMatches * 0.3 +
                            match.fourBitMatches * 0.2,
                        4
                    )
                })),
                ["confidenceScore", "stringCompare", "twoBitMatches", "fourBitMatches"],
                ["desc", "desc", "desc", "desc"]
            );
            const topScore = sortedByScore[0].confidenceScore;
            bestMatches = sortedByScore
                .filter(
                    (match) =>
                        topScore - match.confidenceScore <=
                        config.remoteBestGuess.minScoreDeltaFromTop
                )
                .slice(0, config.remoteBestGuess.maxCandidates)
                .map((match) => omit(match, ["confidenceScore"]));
            this.logger.info(
                `Using closest image matches for "${this.name}": ${bestMatches.map((match) => match.setName).join(", ")}`
            );
        }
        this.logger.info(`Scryfall image matches for "${this.name}": ${bestMatches.length}`);
        return bestMatches;
    }

    async _withRemoteHashDirectory() {
        if (this.hashMode !== "set-symbol") {
            return {
                tempDirectory: "",
                done: () => {}
            };
        }
        const directory = await this.dependencies.createDirectory();
        return {
            tempDirectory: directory,
            done: () => {
                this.dependencies.cleanUpFiles(directory).catch(() => {});
            }
        };
    }

    async _hashRemoteForComparison(url, tempDirectory) {
        if (this.hashMode !== "set-symbol") {
            return this._hashImage(url);
        }
        try {
            return await this._hashRemoteSetSymbol(url, tempDirectory);
        } catch {
            this.logger.error(
                `Remote set-symbol hash failed for "${this.name}"; using full card image`
            );
            return this._hashImage(url);
        }
    }

    async _hashRemoteSetSymbol(url, tempDirectory) {
        const image = await jimp.read(url);
        const cropped = this._cropRemoteSetSymbol(image);
        const tmpFilePath = path.join(tempDirectory, `${randomUUID()}.png`);
        await cropped.writeAsync(tmpFilePath);
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

    _cropRemoteSetSymbol(image) {
        const leftPercent = 0.78;
        const topPercent = 0.535;
        const widthPercent = 0.13;
        const heightPercent = 0.1;
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const left = clamp(Math.round(width * leftPercent), 0, width - 1);
        const top = clamp(Math.round(height * topPercent), 0, height - 1);
        const cropWidth = clamp(Math.round(width * widthPercent), 1, width - left);
        const cropHeight = clamp(Math.round(height * heightPercent), 1, height - top);
        return image.clone().crop(left, top, cropWidth, cropHeight);
    }

    _insertCardHash(setName, hash) {
        // isFoil/isPromo/cardUrl aren't tracked through the matcher pipeline yet, so they're
        // left for the store's own defaults (false/"") -- same as before this was fixed to use
        // the store's real field names instead of a PascalCase fallback chain.
        this.dependencies.CardHashes.upsert({
            cardName: this.name,
            setName,
            cardHash: hash
        });
    }
}

const create = (params) => new ProcessHashes(params);
ProcessHashes.create = create;

export { create, ProcessHashes, defaultDependencies as dependencies };

export default {
    create,
    ProcessHashes,
    dependencies: defaultDependencies
};
