import jimp from "jimp";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getImageDimensions } from "./util.mjs";
import { round, clamp } from "../util.mjs";

// Reusable region registry -- the "layer" other crop spots plug into. Only setSymbol is wired up
// today (see smart-crop plan); name/type/rules-name style regions currently owned by
// ocr-preprocessing.mjs can register here later without reshaping this module.
const regions = {
    setSymbol: {
        leftPercent: 0.78,
        topPercent: 0.535,
        widthPercent: 0.13,
        heightPercent: 0.1
    }
};

const config = {
    minSourceWidth: 360,
    minSourceHeight: 500,
    // Greyscale luminance std-dev (0-255) below this reads as a near-uniform-color crop (solid
    // card border/background instead of a real set-symbol icon).
    lowConfidenceStdDevThreshold: 10
};

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
        image: img.clone().crop(region.left, region.top, region.width, region.height),
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
 * need a file path (e.g. the promisified image-hash lib). Throws on undersized source images and
 * on low-confidence crops -- both cases should fall back to full-card hashing at the call site.
 */
async function writeSetSymbolSnippet(imgPath, directory) {
    const dimensions = await getImageDimensions(imgPath);
    if (dimensions.width < config.minSourceWidth || dimensions.height < config.minSourceHeight) {
        throw new Error("Image is to small");
    }
    const img = await jimp.read(imgPath);
    const result = cropSetSymbolFromImage(img);
    if (result.lowConfidence) {
        throw new Error(`Set symbol crop is low confidence: ${result.reason}`);
    }
    const ext = path.extname(imgPath) || ".jpg";
    const filePath = path.join(directory, `${randomUUID()}${ext}`);
    await result.image.writeAsync(filePath);
    return filePath;
}

export {
    regions,
    cropRegion,
    computeGreyscaleStdDev,
    assessConfidence,
    cropSetSymbolFromImage,
    writeSetSymbolSnippet
};

export default {
    regions,
    cropRegion,
    computeGreyscaleStdDev,
    assessConfidence,
    cropSetSymbolFromImage,
    writeSetSymbolSnippet
};
