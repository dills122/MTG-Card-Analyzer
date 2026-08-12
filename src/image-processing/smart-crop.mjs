import { randomUUID } from "node:crypto";
import path from "node:path";
import { readImage } from "./util.mjs";
import { round, clamp } from "../util.mjs";

// Reusable region registry -- the shared "layer" every crop spot plugs into. setSymbol feeds the
// image-fingerprint path; name/type/rules-name/default feed OCR (region templates, one or more crop
// candidates per type -- ocr-preprocessing.mjs runs each through its own pixel preprocessing and
// picks the best result after real OCR scoring, so these carry no confidence heuristic here).
const regions = {
    setSymbol: {
        leftPercent: 0.78,
        topPercent: 0.535,
        widthPercent: 0.13,
        heightPercent: 0.1
    },
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
        },
        {
            key: "name-full",
            leftPercent: 0.015,
            topPercent: 0.02,
            widthPercent: 0.97,
            heightPercent: 0.14,
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

regions["soft-name"] = regions.name.flatMap((template) => [
    {
        ...template,
        key: `${template.key}-soft`,
        mode: "soft",
        psm: template.key === "name-wide" ? "raw-line" : template.psm
    },
    {
        ...template,
        key: `${template.key}-soft-inverted`,
        mode: "soft-inverted",
        psm: template.key === "name-wide" ? "raw-line" : template.psm
    }
]);

// OCR types without a dedicated table (or unrecognized types) fall back to the default bands.
function getRegionTemplates(type) {
    return regions[type] || regions.default;
}

const config = {
    minSourceWidth: 360,
    minSourceHeight: 500,
    // A source below the standard minimum but within this factor of it is still treated as
    // recoverable for OCR (see assertOcrSourceSizeOk) -- anything further out is degenerate/
    // unreadable rather than merely low-resolution.
    maxRecoverableUpscaleFactor: 2,
    // Greyscale luminance std-dev (0-255) below this reads as a near-uniform-color crop (solid
    // card border/background instead of a real set-symbol icon).
    lowConfidenceStdDevThreshold: 10
};

function assertSourceSizeOk(dimensions) {
    if (dimensions.width < config.minSourceWidth || dimensions.height < config.minSourceHeight) {
        throw new Error("Image is to small");
    }
}

function computeSourceUpscaleFactor(dimensions) {
    return Math.max(
        1,
        config.minSourceWidth / dimensions.width,
        config.minSourceHeight / dimensions.height
    );
}

/**
 * OCR-specific sizing gate (GitHub issue #156). Unlike assertSourceSizeOk's hard cutoff --
 * used for set-symbol image-fingerprint crops, where a soft/undersized crop actively hurts hash
 * comparison -- every OCR crop is upscaled to a fixed minimum width by padAndScale
 * (see binarize.mjs) regardless of source resolution. So a source that's merely somewhat
 * under the standard minimum can still reach OCR instead of being rejected outright; only a
 * source too small/degraded to trust at all (further than maxRecoverableUpscaleFactor out)
 * is still rejected.
 * @param {{width: number, height: number}} dimensions
 * @returns {{upscaleFactor: number, upscaled: boolean}}
 */
function assertOcrSourceSizeOk(dimensions) {
    const upscaleFactor = computeSourceUpscaleFactor(dimensions);
    if (upscaleFactor > config.maxRecoverableUpscaleFactor) {
        throw new Error("Image is to small");
    }
    return { upscaleFactor, upscaled: upscaleFactor > 1 };
}

/**
 * Crop a jimp image to a named region's percent-based geometry. Pure -- clones rather than
 * mutating the caller's image.
 */
function cropRegion(img, percents) {
    const { width, height } = img.bitmap;
    const left = clamp(round(width * percents.leftPercent), 0, width - 1);
    const top = clamp(round(height * percents.topPercent), 0, height - 1);
    const cropWidth = clamp(round(width * percents.widthPercent), 1, width - left);
    const cropHeight = clamp(round(height * percents.heightPercent), 1, height - top);
    const region = { left, top, width: cropWidth, height: cropHeight };
    return {
        image: img.clone().crop({
            x: region.left,
            y: region.top,
            w: region.width,
            h: region.height
        }),
        region
    };
}

function computeGreyscaleStdDev(img) {
    const grey = img.clone().greyscale();
    const { data } = grey.bitmap;
    let sum = 0;
    let count = 0;
    for (let idx = 0; idx < data.length; idx += 4) {
        sum += data[idx];
        count += 1;
    }
    const mean = count > 0 ? sum / count : 0;
    let squaredDiffSum = 0;
    for (let idx = 0; idx < data.length; idx += 4) {
        squaredDiffSum += (data[idx] - mean) ** 2;
    }
    return count > 0 ? Math.sqrt(squaredDiffSum / count) : 0;
}

/**
 * Flag crops that likely landed on a blank/flat area (solid border, background) rather than real
 * content, so callers can fall back instead of hashing noise.
 */
function assessConfidence(croppedImg) {
    const stdDev = computeGreyscaleStdDev(croppedImg);
    if (stdDev < config.lowConfidenceStdDevThreshold) {
        return {
            lowConfidence: true,
            reason: `flat region (stdDev ${round(stdDev, 2)} < ${config.lowConfidenceStdDevThreshold})`
        };
    }
    return { lowConfidence: false };
}

/**
 * Crop the set-symbol region from an already-loaded jimp image. Used by callers that already
 * have an in-memory image (e.g. remote Scryfall image comparison).
 */
function cropSetSymbolFromImage(img) {
    const { image, region } = cropRegion(img, regions.setSymbol);
    return { image, region, ...assessConfidence(image) };
}

/**
 * Crop the set-symbol region from a file on disk and write it to a temp file, for callers that
 * need a file path. Throws on undersized source images and
 * on low-confidence crops -- both cases should fall back to full-card hashing at the call site.
 */
async function writeSetSymbolSnippet(imgPath, directory) {
    const img = await readImage(imgPath);
    const dimensions = img.bitmap;
    assertSourceSizeOk(dimensions);
    const result = cropSetSymbolFromImage(img);
    if (result.lowConfidence) {
        throw new Error(`Set symbol crop is low confidence: ${result.reason}`);
    }
    const ext = path.extname(imgPath) || ".jpg";
    const filePath = path.join(directory, `${randomUUID()}${ext}`);
    await result.image.write(filePath);
    return filePath;
}

export {
    regions,
    getRegionTemplates,
    cropRegion,
    computeGreyscaleStdDev,
    assessConfidence,
    assertSourceSizeOk,
    assertOcrSourceSizeOk,
    cropSetSymbolFromImage,
    writeSetSymbolSnippet
};

export default {
    regions,
    getRegionTemplates,
    cropRegion,
    computeGreyscaleStdDev,
    assessConfidence,
    assertSourceSizeOk,
    assertOcrSourceSizeOk,
    cropSetSymbolFromImage,
    writeSetSymbolSnippet
};
