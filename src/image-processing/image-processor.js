const _ = require("lodash");
const joi = require("joi");

const logger = require("../logger/log");
const dependencies = {
    resize: require("./resize"),
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
        const done = _.once(callback);
        this.cropImage()
            .then(() => this.extractText())
            .then((results) => done(null, results))
            .catch((err) => done(err));
    }

    cropImage() {
        return dependencies.resize
            .GetImageSnippetTmpFile(this.path, this.directory, this.type)
            .then((imgPath) => {
                this.imagePath = imgPath;
                return imgPath;
            });
    }

    extractText() {
        return new Promise((resolve, reject) => {
            dependencies.textExtraction.ScanImage(this.imagePath, (err, extractResults) => {
                if (err) {
                    return reject(err);
                }
                this.results = extractResults;
                return resolve(this.results);
            });
        });
    }
}

module.exports = {
    create: function (params) {
        return new ImageProcessor(params);
    },
    dependencies
};
