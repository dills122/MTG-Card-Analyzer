import { randomUUID } from "node:crypto";
import path from "node:path";
import jimp from "jimp";
import { getImageDimensions } from "./util.mjs";
import smartCrop from "./smart-crop.mjs";
import {
    computeOtsuThreshold,
    applyThreshold,
    shouldInvert,
    sharpen,
    padAndScale
} from "./binarize.mjs";
import log from "../logger/log.mjs";

const defaultLogger = log.create({ isPretty: true });

// Tuned preprocessing settings to make small MTG text pop for OCR. Crop geometry (region
// templates, percent->pixel math, min-source-size gate) lives in smart-crop.mjs -- this module
// only owns what happens to the pixels after the crop.
const preprocessConfig = {
    padding: 12,
    scaleFactor: 2.75,
    minOutputWidth: 900,
    contrast: 0.35,
    brightness: 0.05,
    blur: 1,
    invertPivot: 110
};

/**
 * Build OCR-ready variants for likely text regions.
 * @param {string} imgPath
 * @param {"name"|"type"|"rules-name"} type
 * @param {{directory?: string}} options
 * @returns {Promise<{variants: Array, previewPath?: string}>}
 */
async function prepareOcrVariants(imgPath, type, options = {}) {
    const { directory, logger = defaultLogger } = options;
    const dimensions = await getImageDimensions(imgPath);
    smartCrop.assertSourceSizeOk(dimensions);

    const baseImage = await jimp.read(imgPath);
    const templates = smartCrop.getRegionTemplates(type);
    const variants = [];

    for (const template of templates) {
        const processed = await cropAndPreprocess(baseImage, template);
        const buffer = await processed.getBufferAsync(jimp.MIME_PNG);
        variants.push({
            region: template.key,
            psm: template.psm,
            buffer,
            image: processed
        });
    }

    let previewPath;
    if (directory && variants[0]) {
        previewPath = await writePreview(variants[0].image, directory, type, variants[0].region);
        logger.info(`Wrote OCR preview crop for "${type}": ${previewPath}`);
    }

    return { variants, previewPath };
}

async function cropAndPreprocess(baseImage, template) {
    const { image: cropped } = smartCrop.cropRegion(baseImage, template);
    return template.mode === "soft" ? buildSoftOcrImage(cropped) : buildOcrImage(cropped);
}

/**
 * OCR-friendly preprocessing: grayscale -> normalize -> blur -> upscale -> threshold -> invert -> sharpen.
 */
async function buildOcrImage(img) {
    let working = img
        .clone()
        .greyscale()
        .normalize()
        .contrast(preprocessConfig.contrast)
        .brightness(preprocessConfig.brightness);
    working = working.gaussian(preprocessConfig.blur);
    working = await padAndScale(
        working,
        preprocessConfig.padding,
        preprocessConfig.scaleFactor,
        preprocessConfig.minOutputWidth
    );

    const threshold = computeOtsuThreshold(working);
    working = applyThreshold(working, threshold);

    if (shouldInvert(working, preprocessConfig.invertPivot)) {
        working.invert();
    }

    working = sharpen(working);
    return working;
}

async function buildSoftOcrImage(img) {
    const working = img.clone().greyscale().normalize().contrast(0.2);
    return padAndScale(
        working,
        preprocessConfig.padding,
        preprocessConfig.scaleFactor,
        preprocessConfig.minOutputWidth
    );
}

async function writePreview(image, directory, type, regionKey) {
    const filePath = path.join(directory, `${type || "ocr"}-${regionKey}-${randomUUID()}.png`);
    await image.writeAsync(filePath);
    return filePath;
}

export { prepareOcrVariants };

export default {
    prepareOcrVariants
};
