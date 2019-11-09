const async = require("async");
const _ = require('lodash');
const joi = require("@hapi/joi");
const { callbackify } = require("util");

const logger = require('../logger/log');
const dependencies = {
    resize: callbackify(require('../image-processing/index').resize.GetImageSnippetTmpFile),
    textExtraction: require("../image-analysis/index").textExtraction
};
const schema = joi.object().keys({
    path: joi.string().required(),
    type: joi.string().required(),
    directory: joi.string().required(),
    logger: joi.object().optional()
})

class ImageProcessor {
    constructor(params) {
        let isValid = !joi.validate(params, schema).error;
        if(!isValid) {
            throw new Error("Required params missing");
        }
        _.assign(this, params);
        if(!this.logger) {
            this.logger = logger.create({
                isPretty: false
            });
        }
    }

    extract(callback) {
        async.waterfall([
            (next) => this.cropImage(next),
            (next) => this.extractText(next)
        ], callback);
    }

    cropImage(callback) {
        dependencies.resize(this.path, this.directory, this.type, (err, imgPath) => {
            if(err) {
                return callback(err);
            }
            this.imagePath = imgPath;
            return callback();
        });
    }

    extractText(callback) {
        dependencies.textExtraction.ScanImage(this.imagePath, (err, extractResults) => {
            if(err) {
                return callback(err);
            }
            this.results = extractResults;
            return callback(null, this.results);
        });
    }
}

module.exports = {
    create: function (params) {
        return new ImageProcessor(params);
    },
    dependencies
}