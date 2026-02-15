import _ from "lodash";
import async from "async";
import logger from "../logger/log.mjs";
import joi from "joi";
import rds from "../rds/index.mjs";
import imageHashing from "../image-hashing/index.mjs";

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
    CardHashes: rds.CardHashes,
    Hash: imageHashing.Hash
};

const schema = joi.object().keys({
    cards: joi.array().min(1).required(),
    localHash: joi.string().min(1).required(),
    name: joi.string().required(),
    queryingEnabled: joi.boolean().optional().default(false),
    ignoreNoDbMatch: joi.boolean().optional().default(false),
    allowRemoteBestGuess: joi.boolean().optional().default(false)
});

class ProcessHashes {
    constructor(params = {}) {
        const { dependencies, logger: injectedLogger, ...rest } = params;
        const validatedSchema = joi.attempt(rest, schema);
        _.assign(this, validatedSchema);
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

    compareDbHashes(callback) {
        this.logger.info(`process-hashes::compareDbHashes: Compare DB Hashes`);
        this.dependencies.CardHashes.GetHashes(this.name, (err, hashes) => {
            if (err) {
                return callback(err);
            }
            const matches = [];
            hashes.forEach((dbHash) => {
                const compareResults = this.dependencies.Hash.CompareHash(
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
            this.logger.info(matches);
            if (matches.length === 0) {
                this.logger.info(
                    `process-hashes::compareDbHashes: No DB Hash Match Found ${this.name}`
                );
                if (this.ignoreNoDbMatch) {
                    return callback(null, []);
                }
                return callback({
                    error: "No Matches Found"
                });
            }
            return callback(null, matches);
        });
    }

    compareRemoteImages(callback) {
        this.logger.info(`process-hashes::compareDbHashes: Compare Remote Image Hashes`);
        const cards = _.map(this.cards, function (card) {
            const images = card.image_uris || {};
            return {
                imgUrl: images.normal || images.large,
                setName: card.set_name
            };
        });
        const comparisonResultsList = [];
        async.each(
            cards,
            (card, cb) => {
                const url = card.imgUrl;
                this.dependencies.Hash.HashImage(url, (err, remoteImageHash) => {
                    if (err) {
                        return cb(err);
                    }
                    const setName = card.setName;
                    this._insertCardHash(setName, remoteImageHash);
                    const comparisonResults = this.dependencies.Hash.CompareHash(
                        this.localHash,
                        remoteImageHash
                    );
                    if (!_.isEmpty(comparisonResults)) {
                        comparisonResultsList.push(
                            Object.assign(comparisonResults, {
                                setName
                            })
                        );
                    }
                    return cb();
                });
            },
            (err) => {
                if (err) {
                    return callback(err);
                }
                const matchValues = config.remoteMatch;
                let bestMatches = _.filter(comparisonResultsList, function (match) {
                    return (
                        match.twoBitMatches >= matchValues.twoBit &&
                        match.fourBitMatches >= matchValues.fourBit &&
                        match.stringCompare >= matchValues.stringCompare
                    );
                });
                if (
                    this.allowRemoteBestGuess &&
                    _.isEmpty(bestMatches) &&
                    !_.isEmpty(comparisonResultsList)
                ) {
                    const sortedByScore = _.orderBy(
                        comparisonResultsList.map((match) => ({
                            ...match,
                            confidenceScore: _.round(
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
                        .map((match) => _.omit(match, ["confidenceScore"]));
                    this.logger.info(
                        "process-hashes::compareRemoteImages: Using best available match"
                    );
                    this.logger.info(bestMatches);
                }
                return callback(null, bestMatches);
            }
        );
    }

    _insertCardHash(setName, hash) {
        if (this.queryingEnabled) {
            this.dependencies.CardHashes.InsertEntity({
                Name: this.name,
                SetName: setName,
                CardHash: hash
            });
        }
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
