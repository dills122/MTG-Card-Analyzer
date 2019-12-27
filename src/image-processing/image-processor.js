const async = require("async");
const _ = require('lodash');
const joi = require("@hapi/joi");

const logger = require('../logger/log');
const dependencies = {
    resize: require('./resize'),
    textExtraction: require("../image-analysis/index").textExtraction
};
const schema = joi.object().keys({
    path: joi.string().required(),
    type: joi.string().required(),
    directory: joi.string().required(),
    logger: joi.object().optional()
});

class ImageProcessor {
    constructor(params = {}) {
        let validatedSchema = joi.attempt(params, schema);
        _.assign(this, validatedSchema);
        if (!this.logger) {
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
        dependencies.resize.GetImageSnippetTmpFile(this.path, this.directory, this.type).then((imgPath) => {
            this.imagePath = imgPath;
            return callback();
        }).catch((err) => {
            return callback(err);
        })
    }

    extractText(callback) {
        dependencies.textExtraction.ScanImage(this.imagePath, (err, extractResults) => {
            if (err) {
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