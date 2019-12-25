const async = require("async");
const _ = require('lodash');
const {
    callbackify
} = require("util");

const logger = require('../logger/log');
const dependencies = {
    ImageProcessor: require("./image-processor"),
    CreateDirectory: callbackify(require("../file-io").CreateDirectory),
    MatchName: require("../fuzzy-matching/index").MatchName,
    Hasher: require("../image-hashing/hash-image").HashImage,
    MatchProcessor: require("./matching-processor"),
    NeedsAttention: require("../models/needs-attention"),
    Collection: require("../models/card-collection"),
    RDSCollection: require("../rds").Collection,
    GetAdditionalCardInfo: require("../scryfall-api").Search.SearchByNameExact,
    Base64: callbackify(require("image-to-base64"))
};

class Processor {
    constructor(params) {
        this.filePath = params.filePath;
        this.queryingEnabled = params.queryingEnabled;
        this.imagePaths = {};
        this.extractedText = {};
        this.matcherResults = [];
        this.logger = logger.create({
            isPretty: params.isPretty
        });
    }

    execute(callback) {
        async.waterfall([
            (next) => this.createDirectory(next),
            (next) => this.extractName(next),
            (next) => this.processExtractionResults(next),
            (next) => this.attemptMatching(next)
        ], callback);
    }

    createDirectory(callback) {
        dependencies.CreateDirectory((err, directory) => {
            if (err) {
                return callback(err);
            }
            this.directory = directory;
            return callback();
        });
    }

    extractName(callback) {
        let extractor = dependencies.ImageProcessor.create({
            path: this.filePath,
            type: 'name',
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
        async.each(this.nameMatches, (match, cb) => {
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
            })
        }, (err) => {
            if (err) {
                return callback(err);
            }
            if (_.isEmpty(this.matcherResults)) {
                return callback(new Error("No matches found"));
            }
            if (this.matcherResults.length === 1) {
                this.CreateCollectionsRecord(this.matcherResults[0], callback);
            } else {
                async.each(this.matcherResults, this.CreateNeedsAttentionRecord, (err) => {
                    if(err) {
                        return callback(err);
                    }
                    return callback();
                });
            }
        });
    }

    CreateNeedsAttentionRecord(record, callback) {
        dependencies.Base64(this.nameExtractionImagePath, (err, name64Image) => {
            if(err) {
                return callback(err);
            }
            let needsAttenionModel = dependencies.NeedsAttention.create({
                cardName: record.name,
                extractedText: this.nameExtractionResults.cleanText,
                dirtyExtractedText: this.nameExtractionResults.dirtyText,
                possibleSets: record.sets.join(','),
                nameImage: name64Image
            });
            needsAttenionModel.Insert();
            return callback();
        });
    }

    CreateCollectionsRecord(record, callback) {
        let set = record.sets[0];
        async.parallel([
            (next) => dependencies.RDSCollection.GetQuantity(record.name, set, next),
            (next) => dependencies.GetAdditionalCardInfo(record.name, '', next)
        ], (err, results) => {
            if (err) {
                return callback(err);
            }
            let [qty, additionalInfo] = results;
            let collectionsModel = dependencies.Collection.create({
                cardName: record.name,
                cardSet: set,
                quantity: qty,
                automated: true,
                magicId: additionalInfo.tcgplayer_id,
                imageUrl: additionalInfo.image_uris.normal,
                estValue: _.round((additionalInfo.prices.usd * qty), 4),
                cardType: additionalInfo.type_line
            });
            collectionsModel.Insert();
            return callback();
        });
    }
}

module.exports = {
    create: function (params) {
        return new Processor(params);
    },
    dependencies
}