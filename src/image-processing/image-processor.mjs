import joi from "joi";
import logger from "../logger/log.mjs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import ocrPreprocessor from "./ocr-preprocessing.mjs";
import { textExtraction } from "../image-analysis/index.mjs";
import { once } from "../util.mjs";

const defaultDependencies = {
    ocrPreprocessor,
    textExtraction,
    writeFile
};

const schema = joi.object().keys({
    path: joi.string().required(),
    type: joi.string().required(),
    directory: joi.string().required(),
    logger: joi.object().optional(),
    ocrOptions: joi.object().optional(),
    persistArtifacts: joi.boolean().optional()
});

class ImageProcessor {
    constructor(params = {}) {
        const { dependencies, logger: injectedLogger, ...rest } = params;
        const validatedSchema = joi.attempt(rest, schema);
        Object.assign(this, validatedSchema);
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
        const done = once(callback);
        this.cropImage()
            .then(() => this.extractText())
            .then((results) => done(null, results))
            .catch((err) => done(err));
    }

    cropImage() {
        return this.dependencies.ocrPreprocessor
            .prepareOcrVariants(this.path, this.type, {
                directory: this.persistArtifacts === false ? undefined : this.directory,
                logger: this.logger
            })
            .then(({ variants, previewPath }) => {
                this.ocrVariants = variants;
                this.imagePath = previewPath;
                return variants;
            });
    }

    extractText() {
        return new Promise((resolve, reject) => {
            this.dependencies.textExtraction.scanImage(
                this.ocrVariants || this.imagePath,
                this.type,
                async (err, extractResults) => {
                    if (err) {
                        return reject(err);
                    }
                    this.results = extractResults;
                    try {
                        if (
                            this.persistArtifacts !== false &&
                            extractResults?.bestVariant?.buffer &&
                            this.directory
                        ) {
                            this.imagePath = await this.persistBestVariant(
                                extractResults.bestVariant.buffer
                            );
                        }
                    } catch (writeErr) {
                        return reject(writeErr);
                    }
                    return resolve(this.results);
                },
                { logger: this.logger, ...(this.ocrOptions || {}) }
            );
        });
    }

    async persistBestVariant(buffer) {
        const filePath = path.join(this.directory, `${randomUUID()}.png`);
        await this.dependencies.writeFile(filePath, buffer);
        return filePath;
    }
}

const create = (params) => new ImageProcessor(params);

export { create, defaultDependencies as dependencies, ImageProcessor };

export default {
    create,
    dependencies: defaultDependencies,
    ImageProcessor
};
