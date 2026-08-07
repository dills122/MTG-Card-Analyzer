import _ from "lodash";
import { callbackify, inspect } from "node:util";
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
        const execution = this.executeAsync();
        if (typeof callback === "function") {
            execution.then(() => callback()).catch((err) => callback(err));
            return;
        }
        return execution;
    }

    async executeAsync() {
        await this.createDirectoryAsync();
        await this.extractNameAsync();
        await this.processExtractionResultsAsync();
        await this.attemptMatchingAsync();
    }

    createDirectory(callback) {
        const execution = this.createDirectoryAsync();
        if (typeof callback === "function") {
            execution.then(() => callback()).catch((err) => callback(err));
            return;
        }
        return execution;
    }

    async createDirectoryAsync() {
        this.logger.info("Creating Directory");
        const directory = await dependencies.FileIO.CreateDirectory();
        this.directory = directory;
    }

    extractName(callback) {
        const execution = this.extractNameAsync();
        if (typeof callback === "function") {
            execution.then(() => callback()).catch((err) => callback(err));
            return;
        }
        return execution;
    }

    async extractNameAsync() {
        this.logger.info("Extracting Name");
        const extractor = dependencies.ImageProcessor.create({
            path: this.filePath,
            type: "name",
            directory: this.directory
        });
        const results = await new Promise((resolve, reject) => {
            extractor.extract((err, extractedResults) => {
                if (err) {
                    return reject(err);
                }
                return resolve(extractedResults);
            });
        });
        this.nameExtractionImagePath = extractor.imagePath;
        this.nameExtractionResults = results;
    }

    processExtractionResults(callback) {
        const execution = this.processExtractionResultsAsync();
        if (typeof callback === "function") {
            execution.then(() => callback()).catch((err) => callback(err));
            return;
        }
        return execution;
    }

    async processExtractionResultsAsync() {
        this.logger.info("Matching Name");
        const matchResults = await dependencies.MatchName.create({
            cleanText: this.nameExtractionResults.cleanText,
            dirtyText: this.nameExtractionResults.dirtyText
        }).Match();
        this.nameMatches = matchResults;
        this.logger.info(formatMatchSummary(this.nameMatches));
    }

    attemptMatching(callback) {
        const execution = this.attemptMatchingAsync();
        if (typeof callback === "function") {
            execution.then(() => callback()).catch((err) => callback(err));
            return;
        }
        return execution;
    }

    async attemptMatchingAsync() {
        this.logger.info(`Attempting Matching with ${this.nameMatches.length} candidate names`);
        const matchResults = await Promise.all(
            this.nameMatches.map((match) => this._attemptMatch(match))
        );
        this.matcherResults.push(...matchResults);
        if (_.isEmpty(this.matcherResults)) {
            throw new Error("No matches found");
        }
        if (!this.queryingEnabled) {
            this.logger.info("Final results:");
            // Print user-facing results in a readable object format.
            console.log(
                inspect(this.matcherResults, {
                    depth: null,
                    colors: false,
                    compact: false
                })
            );
            return;
        }
        if (this.matcherResults.length === 1) {
            await this.CreateCollectionsRecordAsync(this.matcherResults[0]);
            return;
        }
        await Promise.all(
            this.matcherResults.map((matchResult) =>
                this.CreateNeedsAttentionRecordAsync(matchResult)
            )
        );
    }

    _attemptMatch(match) {
        const matchProcessor = dependencies.MatchProcessor.create({
            name: match.name,
            filePath: this.filePath,
            queryingEnabled: this.queryingEnabled,
            logger: this.logger
        });
        return new Promise((resolve, reject) => {
            matchProcessor.execute((err, results) => {
                if (err) {
                    return reject(err);
                }
                return resolve({
                    name: match.name,
                    sets: results,
                    setVerificationLinks: matchProcessor.matchResultDetails || []
                });
            });
        });
    }

    CreateNeedsAttentionRecord(record, callback) {
        const execution = this.CreateNeedsAttentionRecordAsync(record);
        if (typeof callback === "function") {
            execution.then(() => callback()).catch((err) => callback(err));
            return;
        }
        return execution;
    }

    async CreateNeedsAttentionRecordAsync(record) {
        this.logger.info("Creating Needs Attention Record");
        const name64Image = await new Promise((resolve, reject) => {
            dependencies.Base64(this.nameExtractionImagePath, (err, encodedImage) => {
                if (err) {
                    return reject(err);
                }
                return resolve(encodedImage);
            });
        });
        const needsAttenionModel = dependencies.NeedsAttention.create({
            cardName: record.name,
            extractedText: this.nameExtractionResults.cleanText,
            dirtyExtractedText: this.nameExtractionResults.dirtyText,
            possibleSets: record.sets.join(","),
            nameImage: name64Image
        });
        needsAttenionModel.Insert();
    }

    CreateCollectionsRecord(record, callback) {
        const execution = this.CreateCollectionsRecordAsync(record);
        if (typeof callback === "function") {
            execution.then(() => callback()).catch((err) => callback(err));
            return;
        }
        return execution;
    }

    async CreateCollectionsRecordAsync(record) {
        this.logger.info("Creating Collections Record");
        const set = record.sets[0];
        let qty;
        let additionalInfo;
        try {
            [qty, additionalInfo] = await Promise.all([
                new Promise((resolve, reject) => {
                    dependencies.RDSCollection.GetQuantity(record.name, set, (err, quantity) => {
                        if (err) {
                            return reject(err);
                        }
                        return resolve(quantity);
                    });
                }),
                new Promise((resolve, reject) => {
                    dependencies.GetAdditionalCardInfo.SearchByNameExact(
                        record.name,
                        "",
                        (err, info) => {
                            if (err) {
                                return reject(err);
                            }
                            return resolve(info);
                        }
                    );
                })
            ]);
        } catch (err) {
            this.logger.error(err);
            throw err;
        }
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
    }
}

function formatMatchSummary(matches = []) {
    if (!matches.length) {
        return "Matches returned (0): none";
    }

    const summarized = matches.map((match, index) => {
        const name = _.get(match, "name", "unknown");
        const rawPercent = Number(_.get(match, "percentage", 0));
        const displayPercent = _.round(rawPercent <= 1 ? rawPercent * 100 : rawPercent, 1);
        return `${index + 1}. ${name} (${displayPercent}%)`;
    });

    return `Matches returned (${matches.length}): ${summarized.join(" | ")}`;
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
