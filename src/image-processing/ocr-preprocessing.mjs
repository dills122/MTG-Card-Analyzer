import { randomUUID } from "node:crypto";
import path from "node:path";
import { JimpMime } from "jimp";
import { readImage } from "./util.mjs";
import { adjustBrightness } from "./color-adjustments.mjs";
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
const nameCharacterWhitelist =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',-/ ";
const titleNameTypes = new Set(["name", "soft-name", "rotated-name"]);

/**
 * Build OCR-ready variants for likely text regions.
 * @param {string} imgPath
 * @param {"name"|"soft-name"|"rotated-name"|"type"|"rules-name"} type
 * @param {{directory?: string}} options
 * @returns {Promise<{variants: Array, previewPath?: string, sourceSizing: {upscaleFactor: number, upscaled: boolean}}>}
 */
async function prepareOcrVariants(imgPath, type, options = {}) {
    const { directory, logger = defaultLogger } = options;
    const baseImage = await readImage(imgPath);
    const dimensions = baseImage.bitmap;
    const sourceSizing = smartCrop.assertOcrSourceSizeOk(dimensions);
    if (sourceSizing.upscaled) {
        logger.warn(
            `OCR source image ${dimensions.width}x${dimensions.height} is below the standard minimum; ` +
                `proceeding ${sourceSizing.upscaleFactor.toFixed(2)}x undersized (see issue #156)`
        );
    }

    if (type === "rotated-name") {
        return {
            variants: await buildRotatedNameVariants(baseImage, {
                lowResolutionSource: sourceSizing.upscaled
            }),
            sourceSizing
        };
    }
    const templates = smartCrop.getRegionTemplates(type);
    const variants = [];

    for (const template of templates) {
        const processed = await cropAndPreprocess(baseImage, template, {
            // Hard Otsu thresholding + invert + sharpen (buildOcrImage) assumes real per-pixel
            // detail to binarize; on a source that's already been stretched past its native
            // resolution, that detail is interpolated noise, and thresholding it destroys
            // character shapes rather than clarifying them. The soft profile (contrast only,
            // no threshold) reads noticeably better on undersized sources -- see issue #156.
            lowResolutionSource: sourceSizing.upscaled
        });
        const buffer = await processed.getBuffer(JimpMime.png);
        variants.push({
            region: template.key,
            psm: template.psm,
            ...(titleNameTypes.has(type) ? { characterWhitelist: nameCharacterWhitelist } : {}),
            buffer,
            image: processed
        });
    }

    let previewPath;
    if (directory && variants[0]) {
        previewPath = await writePreview(variants[0].image, directory, type, variants[0].region);
        logger.info(`Wrote OCR preview crop for "${type}": ${previewPath}`);
    }

    return { variants, previewPath, sourceSizing };
}

async function buildRotatedNameVariants(baseImage, options = {}) {
    const variants = [];
    const template = {
        leftPercent: 0.015,
        topPercent: 0.015,
        widthPercent: 0.97,
        heightPercent: 0.15,
        psm: "block"
    };
    for (const rotation of [90, -90]) {
        const rotated = baseImage.clone().rotate(rotation);
        for (const mode of ["hard", "soft"]) {
            const processed = await cropAndPreprocess(
                rotated,
                {
                    ...template,
                    mode: mode === "soft" ? "soft" : undefined
                },
                options
            );
            variants.push({
                region: `rotated-name-${rotation === 90 ? "cw" : "ccw"}-${mode}`,
                psm: template.psm,
                characterWhitelist: nameCharacterWhitelist,
                buffer: await processed.getBuffer(JimpMime.png),
                image: processed
            });
        }
    }
    return variants;
}

async function cropAndPreprocess(baseImage, template, options = {}) {
    const { image: cropped } = smartCrop.cropRegion(baseImage, template);
    if (template.mode === "soft-inverted") {
        return buildSoftOcrImage(cropped, true);
    }
    const useSoftProfile = template.mode === "soft" || options.lowResolutionSource;
    return useSoftProfile ? buildSoftOcrImage(cropped) : buildOcrImage(cropped);
}

/**
 * OCR-friendly preprocessing: grayscale -> normalize -> blur -> upscale -> threshold -> invert -> sharpen.
 */
async function buildOcrImage(img) {
    let working = img.clone().greyscale().normalize().contrast(preprocessConfig.contrast);
    adjustBrightness(working, preprocessConfig.brightness);
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

async function buildSoftOcrImage(img, invert = false) {
    const working = img.clone().greyscale().normalize().contrast(0.2);
    if (invert) {
        working.invert();
    }
    return padAndScale(
        working,
        preprocessConfig.padding,
        preprocessConfig.scaleFactor,
        preprocessConfig.minOutputWidth
    );
}

async function writePreview(image, directory, type, regionKey) {
    const filePath = path.join(directory, `${type || "ocr"}-${regionKey}-${randomUUID()}.png`);
    await image.write(filePath);
    return filePath;
}

export { prepareOcrVariants };

export default {
    prepareOcrVariants
};
