const async = require("async");
const _ = require('lodash');
const {
    callbackify
} = require("util");

const logger = require('../logger/log');
const dependencies = {
    ImageProcessor: require("./image-processor"),
    CreateDirectory: callbackify(require("../file-io").CreateDirectory),
};

class Processor {
    constructor(params) {
        this.filePath = params.filePath;
        this.queryingEnabled = params.queryingEnabled;
        this.imagePaths = {};
        this.extractedText = {};
        this.matches = {};
        this.logger = logger.create({
            isPretty: params.isPretty
        });
    }

    execute(callback) {
        async.waterfall([
            (next) => this.createDirectory(next),
            (next) => this.extractName(next)
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
        })
    }
}

module.exports = {
    create: function (params) {
        return new Processor(params);
    },
    dependencies
}