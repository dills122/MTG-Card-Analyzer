import _ from "lodash";
import joi from "joi";
import logger from "../logger/log.mjs";
import resize from "./resize.mjs";
import { textExtraction } from "../image-analysis/index.mjs";

const defaultDependencies = {
    resize,
    textExtraction
};

const schema = joi.object().keys({
    path: joi.string().required(),
    type: joi.string().required(),
    directory: joi.string().required(),
    logger: joi.object().optional()
});

class ImageProcessor {
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

    extract(callback) {
        const done = _.once(callback);
        this.cropImage()
            .then(() => this.extractText())
            .then((results) => done(null, results))
            .catch((err) => done(err));
    }

    cropImage() {
        return this.dependencies.resize
            .GetImageSnippetTmpFile(this.path, this.directory, this.type)
            .then((imgPath) => {
                this.imagePath = imgPath;
                return imgPath;
            });
    }

    extractText() {
        return new Promise((resolve, reject) => {
            this.dependencies.textExtraction.ScanImage(this.imagePath, (err, extractResults) => {
                if (err) {
                    return reject(err);
                }
                this.results = extractResults;
                return resolve(this.results);
            });
        });
    }
}

const create = (params) => new ImageProcessor(params);

export { create, defaultDependencies as dependencies, ImageProcessor };

export default {
    create,
    dependencies: defaultDependencies,
    ImageProcessor
};
