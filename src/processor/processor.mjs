import async from "async";
import _ from "lodash";
import { callbackify } from "node:util";
import joi from "joi";
import logger from "../logger/log.mjs";
import imageProcessing from "../image-processing/index.mjs";
import FileIO from "../file-io.mjs";
import fuzzyMatching from "../fuzzy-matching/index.mjs";
import matcher from "../matcher/index.mjs";
import NeedsAttention from "../models/needs-attention.mjs";
import Collection from "../models/card-collection.mjs";
import rds from "../rds/index.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import imageToBase64 from "image-to-base64";

const dependencies = {
    ImageProcessor: imageProcessing.ImageProcessor,
    FileIO,
    MatchName: fuzzyMatching.MatchName,
    MatchProcessor: matcher.MatchingProcessor,
    NeedsAttention,
    Collection,
    RDSCollection: rds.Collection,
    GetAdditionalCardInfo: scryfallApi.Search,
    Base64: callbackify(imageToBase64)
};

const schema = joi.object().keys({
    filePath: joi.string().min(1).required(),
    queryingEnabled: joi.boolean().default(true),
    isPretty: joi.boolean().default(true)
});

class ProcessorClass {
    constructor(params) {
        const validatedSchema = joi.attempt(params, schema);
        _.assign(this, validatedSchema);
        this.imagePaths = {};
        this.extractedText = {};
        this.matcherResults = [];
        this.logger = logger.create({
            isPretty: this.isPretty
        });
    }

    execute(callback) {
        async.waterfall(
            [
                (next) => this.createDirectory(next),
                (next) => this.extractName(next),
                (next) => this.processExtractionResults(next),
                (next) => this.attemptMatching(next)
            ],
            callback
        );
    }

    createDirectory(callback) {
        this.logger.info("Creating Directory");
        dependencies.FileIO.CreateDirectory((err, directory) => {
            if (err) {
                return callback(err);
            }
            this.directory = directory;
            return callback();
        });
    }

    extractName(callback) {
        this.logger.info("Extracting Name");
        const extractor = dependencies.ImageProcessor.create({
            path: this.filePath,
            type: "name",
            directory: this.directory
        });
        extractor.extract((err, results) => {
            if (err) {
                return callback(err);
            }
            this.nameExtractionImagePath = extractor.imagePath;
            this.nameExtractionResults = results;
            return callback();
        });
    }

    processExtractionResults(callback) {
        this.logger.info("Matching Name");
        dependencies.MatchName.create({
            cleanText: this.nameExtractionResults.cleanText,
            dirtyText: this.nameExtractionResults.dirtyText
        }).Match((err, matchResults) => {
            if (err) {
                return callback(err);
            }
            this.nameMatches = matchResults;
            this.logger.info(`Matches returned ${this.nameMatches}`);
            return callback();
        });
    }

    attemptMatching(callback) {
        this.logger.info("Attempting Matching");
        async.each(
            this.nameMatches,
            (match, cb) => {
                dependencies.MatchProcessor.create({
                    name: match.name,
                    filePath: this.filePath
                }).execute((err, results) => {
                    if (err) {
                        return cb(err);
                    }
                    this.matcherResults.push({
                        name: match.name,
                        sets: results
                    });
                    return cb();
                });
            },
            (err) => {
                if (err) {
                    return callback(err);
                }
                if (_.isEmpty(this.matcherResults)) {
                    return callback(new Error("No matches found"));
                }
                if (!this.queryingEnabled) {
                    this.logger.info("Final results:", this.matcherResults);
                    return callback();
                }
                if (this.matcherResults.length === 1) {
                    this.CreateCollectionsRecord(this.matcherResults[0], callback);
                } else {
                    async.each(
                        this.matcherResults,
                        (match, cb) => {
                            this.CreateNeedsAttentionRecord(match, cb);
                        },
                        (asyncErr) => {
                            if (asyncErr) {
                                return callback(asyncErr);
                            }
                            return callback();
                        }
                    );
                }
            }
        );
    }

    CreateNeedsAttentionRecord(record, callback) {
        this.logger.info("Creating Needs Attention Record");
        dependencies.Base64(this.nameExtractionImagePath, (err, name64Image) => {
            if (err) {
                return callback(err);
            }
            const needsAttenionModel = dependencies.NeedsAttention.create({
                cardName: record.name,
                extractedText: this.nameExtractionResults.cleanText,
                dirtyExtractedText: this.nameExtractionResults.dirtyText,
                possibleSets: record.sets.join(","),
                nameImage: name64Image
            });
            needsAttenionModel.Insert();
            return callback();
        });
    }

    CreateCollectionsRecord(record, callback) {
        this.logger.info("Creating Collections Record");
        const set = record.sets[0];
        async.parallel(
            [
                async.apply(dependencies.RDSCollection.GetQuantity, record.name, set),
                async.apply(dependencies.GetAdditionalCardInfo.SearchByNameExact, record.name, "")
            ],
            (err, results) => {
                if (err) {
                    this.logger.error(err);
                    return callback(err);
                }
                const [qty, additionalInfo] = results;
                const collectionsModel = dependencies.Collection.create({
                    cardName: record.name,
                    cardSet: set,
                    quantity: qty,
                    automated: true,
                    magicId: additionalInfo.tcgplayer_id,
                    imageUrl: additionalInfo.image_uris.normal,
                    estValue: _.round(additionalInfo.prices.usd * qty, 4),
                    cardType: additionalInfo.type_line
                });
                this.logger.info("Preparing to insert record");
                collectionsModel.Insert();
                return callback();
            }
        );
    }
}

export const create = (params) => new ProcessorClass(params);

export { dependencies };

export const Processor = {
    create,
    dependencies,
    Processor: ProcessorClass
};

export { ProcessorClass };

export default Processor;
