import { readFile } from "node:fs/promises";
import joi from "joi";
import logger from "../logger/log.mjs";
import imageProcessing from "../image-processing/index.mjs";
import FileIO from "../file-io.mjs";
import fuzzyMatching from "../fuzzy-matching/index.mjs";
import matcher from "../matcher/index.mjs";
import NeedsAttention from "../models/needs-attention.mjs";
import Collection from "../models/card-collection.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import storage from "../storage/index.mjs";
import { resolveCardName } from "./name-resolver.mjs";
import { formatScanResults } from "../console/format-scan-results.mjs";
import { round } from "../util.mjs";

// Native fs.readFile + Buffer in place of image-to-base64.
async function base64EncodeImage(imagePath) {
    const buffer = await readFile(imagePath);
    return buffer.toString("base64");
}

const dependencies = {
    ImageProcessor: imageProcessing.ImageProcessor,
    FileIO,
    MatchName: fuzzyMatching.MatchName,
    MatchProcessor: matcher.MatchingProcessor,
    NeedsAttention,
    Collection,
    GetAdditionalCardInfo: scryfallApi.Search,
    Base64: base64EncodeImage
};

const schema = joi.object().keys({
    filePath: joi.string().min(1).required(),
    queryingEnabled: joi.boolean().default(true),
    // Collection/needs-attention tracking is an opt-in module (see src/config/index.mjs).
    // --query alone is not enough to write those records; this must also be true.
    collectionEnabled: joi.boolean().default(false),
    isPretty: joi.boolean().default(true),
    // Verbose ops-log capture (see src/config/index.mjs) -- off by default. When on, log
    // entries include the full match detail (set verification links) instead of just
    // name/sets. Meant for troubleshooting, not routine use.
    debugLogging: joi.boolean().default(false)
});

class ProcessorClass {
    constructor(params) {
        const { logger: injectedLogger, ...processorParams } = params;
        const validatedSchema = joi.attempt(processorParams, schema);
        Object.assign(this, validatedSchema);
        this.imagePaths = {};
        this.extractedText = {};
        this.matcherResults = [];
        this.decision = "unknown";
        this.logger =
            injectedLogger ||
            logger.create({
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
        const startedAt = Date.now();
        try {
            await this.createDirectoryAsync();
            await this.extractNameAsync();
            await this.processExtractionResultsAsync();
            await this.attemptMatchingAsync();
            await this.logOperationAsync({ durationMs: Date.now() - startedAt });
        } catch (err) {
            this.decision = this.decision === "unknown" ? "error" : this.decision;
            await this.logOperationAsync({
                durationMs: Date.now() - startedAt,
                error: err?.message || String(err)
            });
            throw err;
        }
    }

    // Local ops log -- part of the always-on nedb cache tier, no-ops when
    // --no-local-cache is set. This is what #49 ("Transaction") became.
    async logOperationAsync(extra = {}) {
        try {
            storage.log.record({
                filePath: this.filePath,
                extractedText: this.nameExtractionResults
                    ? {
                          clean: this.nameExtractionResults.cleanText,
                          dirty: this.nameExtractionResults.dirtyText
                      }
                    : null,
                nameMatches: this.nameMatches || [],
                matcherResults: (this.matcherResults || []).map((result) =>
                    this.debugLogging
                        ? {
                              name: result.name,
                              sets: result.sets,
                              setVerificationLinks: result.setVerificationLinks
                          }
                        : { name: result.name, sets: result.sets }
                ),
                decision: this.decision,
                queryingEnabled: this.queryingEnabled,
                collectionEnabled: this.collectionEnabled,
                storageAdapter: storage.adapterName,
                error: null,
                ...extra
            });
        } catch (logErr) {
            // The ops log is a diagnostic aid, never a reason to fail (or mask) a real scan.
            this.logger.error(logErr);
        }
    }

    async createDirectoryAsync() {
        this.logger.info("Preparing temporary files");
        const directory = await dependencies.FileIO.createDirectory();
        this.directory = directory;
    }

    async extractNameAsync() {
        this.logger.info("Reading card name");
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

    async processExtractionResultsAsync() {
        this.logger.info("Matching card name");
        const resolution = await resolveCardName({
            filePath: this.filePath,
            directory: this.directory,
            ImageProcessor: dependencies.ImageProcessor,
            MatchName: dependencies.MatchName,
            logger: this.logger,
            titleExtractionResults: this.nameExtractionResults,
            titleExtractionImagePath: this.nameExtractionImagePath
        });
        this.nameMatches = resolution.matches;
        this.nameExtractionResults = resolution.extractionResults;
        this.nameExtractionImagePath = resolution.extractionImagePath;
        this.supplementalNameExtractionResults = resolution.supplementalExtractionResults;
        this.logger.info(formatMatchSummary(this.nameMatches));
    }

    async attemptMatchingAsync() {
        const candidateLabel = this.nameMatches.length === 1 ? "candidate" : "candidates";
        this.logger.info(
            `Checking printings for ${this.nameMatches.length} name ${candidateLabel}`
        );
        const matchResults = await Promise.all(
            this.nameMatches.map((match) => this._attemptMatch(match))
        );
        this.matcherResults.push(...matchResults);
        if (this.matcherResults.length === 0) {
            this.decision = "no-match";
            throw new Error("No matches found");
        }
        if (!this.queryingEnabled) {
            this.decision = "dry-run";
            this.printResults();
            return;
        }
        if (!this.collectionEnabled) {
            this.decision = "module-disabled";
            this.logger.info(
                "Collection tracking disabled; scan results were not saved. Enable with --enable-collection."
            );
            this.printResults();
            return;
        }
        if (this.matcherResults.length === 1) {
            this.decision = "collection";
            await this.CreateCollectionsRecordAsync(this.matcherResults[0]);
            return;
        }
        this.decision = "needs-attention";
        await Promise.all(
            this.matcherResults.map((matchResult) =>
                this.CreateNeedsAttentionRecordAsync(matchResult)
            )
        );
    }

    // Prints user-facing results without internal matching and verification fields.
    printResults() {
        this.logger.output(formatScanResults(this.matcherResults));
    }

    async _attemptMatch(match) {
        const matchProcessor = dependencies.MatchProcessor.create({
            name: match.name,
            filePath: this.filePath,
            queryingEnabled: this.queryingEnabled,
            logger: this.logger
        });
        const results = await matchProcessor.executeAsync();
        return {
            name: match.name,
            sets: results,
            setVerificationLinks: matchProcessor.matchResultDetails || []
        };
    }

    async CreateNeedsAttentionRecordAsync(record) {
        this.logger.info(`Saving "${record.name}" for manual review`);
        const name64Image = await dependencies.Base64(this.nameExtractionImagePath);
        const needsAttenionModel = dependencies.NeedsAttention.create({
            cardName: record.name,
            extractedText: this.nameExtractionResults.cleanText,
            dirtyExtractedText: this.nameExtractionResults.dirtyText,
            possibleSets: record.sets.join(","),
            nameImage: name64Image
        });
        await needsAttenionModel.insert();
    }

    async CreateCollectionsRecordAsync(record) {
        this.logger.info(`Saving "${record.name}" to collection`);
        const set = record.sets[0];
        let additionalInfo;
        try {
            additionalInfo = await dependencies.GetAdditionalCardInfo.searchByNameExact(
                record.name,
                ""
            );
        } catch (err) {
            this.logger.error(err);
            throw err;
        }
        // delta defaults to 1 (this scan found one more copy) -- the persistence layer
        // (nedb or rds, whichever is selected) owns adding that to whatever quantity
        // already exists for this cardName+cardSet, and computes estValue from the
        // resulting total using priceUsd. See src/models/card-collection.mjs.
        const collectionsModel = dependencies.Collection.create({
            cardName: record.name,
            cardSet: set,
            automated: true,
            magicId: additionalInfo.tcgplayer_id,
            imageUrl: additionalInfo.image_uris.normal,
            priceUsd: Number(additionalInfo.prices.usd) || 0,
            cardType: additionalInfo.type_line
        });
        await collectionsModel.insert();
    }
}

function formatMatchSummary(matches = []) {
    if (!matches.length) {
        return "Name candidates (0): none";
    }

    const summarized = matches.map((match, index) => {
        const name = match?.name ?? "unknown";
        const rawPercent = Number(match?.percentage ?? 0);
        const displayPercent = round(rawPercent <= 1 ? rawPercent * 100 : rawPercent, 1);
        return `${index + 1}. ${name} (${displayPercent}%)`;
    });

    return `Name candidates (${matches.length}): ${summarized.join(" | ")}`;
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
