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
    MatchProcessor: require("./matching-processor")
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
        dependencies.ImageProcessor.create({
            path: this.filePath,
            type: 'name',
            directory: this.directory
        }).extract((err, results) => {
            if (err) {
                return callback(err);
            }
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
            if(_.isEmpty(this.matcherResults)) {
                return callback(new Error("No matches found"));
            }
            if(this.matcherResults.length === 1) {
                //Insert matched card
            } else {
                //Insert an Needs attention record
            }
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