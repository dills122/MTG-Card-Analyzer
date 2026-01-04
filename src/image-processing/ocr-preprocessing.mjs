import _ from "lodash";
import { randomUUID } from "node:crypto";
import path from "node:path";
import jimp from "jimp";
import { GetImageDimensions } from "./util.mjs";

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
 * @param {"name"|"type"} type
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
        ...percentToPixels(template, dimensions)
    }));
}

function percentToPixels(region, dimensions) {
    return {
        width: _.round(dimensions.width * region.widthPercent),
        height: _.round(dimensions.height * region.heightPercent),
        left: _.round(dimensions.width * region.leftPercent),
        top: _.round(dimensions.height * region.topPercent)
    };
}

async function cropAndPreprocess(baseImage, region) {
    const { left, top, width, height } = clampToImage(
        region,
        baseImage.bitmap.width,
        baseImage.bitmap.height
    );
    const cropped = baseImage.clone().crop(left, top, width, height);
    return buildOcrImage(cropped);
}

function clampToImage(region, width, height) {
    const left = _.clamp(region.left, 0, width);
    const top = _.clamp(region.top, 0, height);
    const clampedWidth = _.clamp(region.width, 1, width - left);
    const clampedHeight = _.clamp(region.height, 1, height - top);
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

    if (shouldInvert(working)) {
        working.invert();
    }

    working = sharpen(working);
    return working;
}

async function padAndScale(img, padding, scaleFactor, minWidth) {
    const padded = await new jimp(
        img.bitmap.width + padding * 2,
        img.bitmap.height + padding * 2,
        0xffffffff
    );
    padded.composite(img, padding, padding);
    const targetWidth = Math.max(minWidth, Math.round(padded.bitmap.width * scaleFactor));
    padded.resize(targetWidth, jimp.AUTO);
    return padded;
}

function computeOtsuThreshold(img) {
    const histogram = new Array(256).fill(0);
    const { data, width, height } = img.bitmap;
    const total = width * height;

    for (let idx = 0; idx < data.length; idx += 4) {
        histogram[data[idx]] += 1;
    }

    let sum = 0;
    for (let i = 0; i < 256; i++) {
        sum += i * histogram[i];
    }

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let max = 0;
    let threshold = 0;

    for (let i = 0; i < 256; i++) {
        wB += histogram[i];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;
        sumB += i * histogram[i];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * Math.pow(mB - mF, 2);
        if (between > max) {
            max = between;
            threshold = i;
        }
    }
    return threshold;
}

function applyThreshold(img, threshold) {
    const output = img.clone();
    const { data } = output.bitmap;
    for (let idx = 0; idx < data.length; idx += 4) {
        const val = data[idx] < threshold ? 0 : 255;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
    }
    return output;
}

function shouldInvert(img) {
    const { data, width, height } = img.bitmap;
    let sum = 0;
    for (let idx = 0; idx < data.length; idx += 4) {
        sum += data[idx];
    }
    const mean = sum / (width * height);
    return mean < preprocessConfig.invertPivot;
}

function sharpen(img) {
    const kernel = [
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
    ];
    return img.convolute(kernel);
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
