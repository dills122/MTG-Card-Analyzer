import { randomUUID } from "node:crypto";
import path from "node:path";
import jimp from "jimp";
import { GetImageDimensions } from "./util.mjs";
import { round, clamp } from "../util.mjs";
import {
    computeOtsuThreshold,
    applyThreshold,
    shouldInvert,
    sharpen,
    padAndScale
} from "./binarize.mjs";

// Tuned preprocessing settings to make small MTG text pop for OCR.
const preprocessConfig = {
    minSourceWidth: 360,
    minSourceHeight: 500,
    padding: 12,
    scaleFactor: 2.75,
    minOutputWidth: 900,
    contrast: 0.35,
    brightness: 0.05,
    blur: 1,
    invertPivot: 110
};

// Region templates focus on likely text bands (top name line, lower type line, and fallbacks).
const regionTemplates = {
    name: [
        {
            key: "name-core",
            leftPercent: 0.08,
            topPercent: 0.05,
            widthPercent: 0.78,
            heightPercent: 0.065,
            psm: "line"
        },
        {
            key: "name-wide",
            leftPercent: 0.05,
            topPercent: 0.045,
            widthPercent: 0.9,
            heightPercent: 0.08,
            psm: "line"
        },
        {
            key: "top-band",
            leftPercent: 0.05,
            topPercent: 0.03,
            widthPercent: 0.9,
            heightPercent: 0.12,
            psm: "block"
        }
    ],
    type: [
        {
            key: "type-core",
            leftPercent: 0.08,
            topPercent: 0.565,
            widthPercent: 0.78,
            heightPercent: 0.08,
            psm: "line"
        },
        {
            key: "type-wide",
            leftPercent: 0.05,
            topPercent: 0.54,
            widthPercent: 0.9,
            heightPercent: 0.1,
            psm: "block"
        },
        {
            key: "lower-band",
            leftPercent: 0.05,
            topPercent: 0.6,
            widthPercent: 0.9,
            heightPercent: 0.14,
            psm: "sparse"
        }
    ],
    "rules-name": [
        {
            key: "rules-name",
            leftPercent: 0.055,
            topPercent: 0.57,
            widthPercent: 0.89,
            heightPercent: 0.31,
            psm: "block",
            mode: "soft"
        }
    ],
    default: [
        {
            key: "top-strip",
            leftPercent: 0.05,
            topPercent: 0.05,
            widthPercent: 0.9,
            heightPercent: 0.15,
            psm: "block"
        },
        {
            key: "bottom-strip",
            leftPercent: 0.05,
            topPercent: 0.75,
            widthPercent: 0.9,
            heightPercent: 0.2,
            psm: "sparse"
        }
    ]
};

/**
 * Build OCR-ready variants for likely text regions.
 * @param {string} imgPath
 * @param {"name"|"type"|"rules-name"} type
 * @param {{directory?: string}} options
 * @returns {Promise<{variants: Array, previewPath?: string}>}
 */
async function prepareOcrVariants(imgPath, type, options = {}) {
    const { directory } = options;
    const dimensions = await GetImageDimensions(imgPath);
    if (
        dimensions.width < preprocessConfig.minSourceWidth ||
        dimensions.height < preprocessConfig.minSourceHeight
    ) {
        throw new Error("Image is to small");
    }

    const baseImage = await jimp.read(imgPath);
    const regions = buildRegions(dimensions, type);
    const variants = [];

    for (const region of regions) {
        const processed = await cropAndPreprocess(baseImage, region);
        const buffer = await processed.getBufferAsync(jimp.MIME_PNG);
        variants.push({
            region: region.key,
            psm: region.psm,
            buffer,
            image: processed
        });
    }

    let previewPath;
    if (directory && variants[0]) {
        previewPath = await writePreview(variants[0].image, directory, type, variants[0].region);
    }

    return { variants, previewPath };
}

function buildRegions(dimensions, type) {
    const templates = regionTemplates[type] || regionTemplates.default;
    return templates.map((template) => ({
        key: template.key,
        psm: template.psm,
        mode: template.mode,
        ...percentToPixels(template, dimensions)
    }));
}

function percentToPixels(region, dimensions) {
    return {
        width: round(dimensions.width * region.widthPercent),
        height: round(dimensions.height * region.heightPercent),
        left: round(dimensions.width * region.leftPercent),
        top: round(dimensions.height * region.topPercent)
    };
}

async function cropAndPreprocess(baseImage, region) {
    const { left, top, width, height } = clampToImage(
        region,
        baseImage.bitmap.width,
        baseImage.bitmap.height
    );
    const cropped = baseImage.clone().crop(left, top, width, height);
    return region.mode === "soft" ? buildSoftOcrImage(cropped) : buildOcrImage(cropped);
}

function clampToImage(region, width, height) {
    const left = clamp(region.left, 0, width);
    const top = clamp(region.top, 0, height);
    const clampedWidth = clamp(region.width, 1, width - left);
    const clampedHeight = clamp(region.height, 1, height - top);
    return {
        left,
        top,
        width: clampedWidth,
        height: clampedHeight
    };
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
