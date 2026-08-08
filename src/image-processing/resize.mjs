import jimp from "jimp";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { GetImageDimensions } from "./util.mjs";
import { round } from "../util.mjs";
import {
    computeOtsuThreshold,
    applyThreshold,
    shouldInvert,
    sharpen,
    padAndScale
} from "./binarize.mjs";

const constants = {
    name: {
        heightPercent: 0.0585,
        widthPercent: 0.755
    },
    type: {
        topPercent: 0.555,
        heightPercent: 0.075,
        widthPercent: 0.725
    },
    art: {
        topPercent: 0.1122,
        heightPercent: 0.4455,
        widthPercent: 0.8557
    },
    flavor: {
        topPercent: 0.6127,
        heightPercent: 0.2927,
        widthPercent: 0.8557
    },
    setSymbol: {
        leftPercent: 0.78,
        topPercent: 0.535,
        widthPercent: 0.13,
        heightPercent: 0.1
    },
    borderPercent: 0.0535
};

// "set-symbol" (hyphenated, the public type string) maps to the setSymbol (camelCase) key above.
const TYPE_CONSTANTS_KEY = {
    name: "name",
    type: "type",
    art: "art",
    flavor: "flavor",
    "set-symbol": "setSymbol"
};

// OCR-friendly pre-processing knobs; tuned for MTG card text lines.
const preprocessConfig = {
    minSourceWidth: 360,
    minSourceHeight: 500,
    minOutputWidth: 900,
    scaleFactor: 2.5,
    padding: 12,
    dilationPasses: 1,
    erosionPasses: 1,
    invertPivot: 110 // invert when mean luminance is dark; keeps white-on-black text legible
};

async function GetImageSnippetTmpFile(imgPath, directory, type) {
    const ext = path.extname(imgPath) || ".jpg";
    const filePath = path.join(directory, `${randomUUID()}${ext}`);
    const img = await buildSnippetImage(imgPath, type);
    await img.writeAsync(filePath);
    return filePath;
}

/**
 * Produce a cropped and preprocessed Jimp image ready for OCR.
 */
async function buildSnippetImage(imgPath, type) {
    const dimensions = await GetImageDimensions(imgPath);
    if (
        dimensions.width < preprocessConfig.minSourceWidth ||
        dimensions.height < preprocessConfig.minSourceHeight
    ) {
        throw new Error("Image is to small");
    }
    const alteredDimensions = GetAlteredDimensions(dimensions, type);
    let img = await jimp.read(imgPath);
    img = cropper(img, alteredDimensions);
    if (type === "name" || type === "type") {
        img = await enhanceForOcr(img);
    } else {
        img = img.normalize();
    }
    return img;
}

// left/top default to constants.borderPercent unless the type's own constants override them
// (setSymbol positions from its own leftPercent/topPercent; type/art/flavor position top from
// their own topPercent).
function GetAlteredDimensions(dimensions, type) {
    const key = TYPE_CONSTANTS_KEY[type];
    if (!key) {
        throw new Error(`Unsupported snippet type "${type}"`);
    }
    const c = constants[key];
    return {
        width: round(dimensions.width * c.widthPercent),
        height: round(dimensions.height * c.heightPercent),
        left: round(dimensions.width * (c.leftPercent ?? constants.borderPercent)),
        top: round(dimensions.height * (c.topPercent ?? constants.borderPercent))
    };
}

function cropper(img, dimensions) {
    return img.crop(dimensions.left, dimensions.top, dimensions.width, dimensions.height);
}

/**
 * Normalize for OCR: grayscale -> denoise -> threshold -> morph -> pad/scale -> sharpen.
 */
async function enhanceForOcr(img) {
    img = img.greyscale().normalize().contrast(0.25).brightness(0.05).gaussian(1); // light blur to reduce noise before thresholding

    const threshold = computeOtsuThreshold(img);
    img = applyThreshold(img, threshold);

    if (shouldInvert(img, preprocessConfig.invertPivot)) {
        img.invert();
    }

    img = binaryDilate(img, preprocessConfig.dilationPasses);
    img = binaryErode(img, preprocessConfig.erosionPasses);
    img = await padAndScale(
        img,
        preprocessConfig.padding,
        preprocessConfig.scaleFactor,
        preprocessConfig.minOutputWidth
    );
    img = sharpen(img);
    return img;
}

// Dilate/erode are the same 3x3-neighborhood sweep, differing only in whether they keep the
// brightest (dilate) or darkest (erode) neighbor.
function morphologicalOp(img, iterations, combine, initial) {
    let working = img.clone();
    for (let iter = 0; iter < iterations; iter++) {
        const source = Buffer.from(working.bitmap.data);
        const { width, height } = working.bitmap;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let result = initial;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const nx = x + kx;
                        const ny = y + ky;
                        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                        const nIdx = (width * ny + nx) * 4;
                        result = combine(result, source[nIdx]);
                    }
                }
                const idx = (width * y + x) * 4;
                working.bitmap.data[idx] = result;
                working.bitmap.data[idx + 1] = result;
                working.bitmap.data[idx + 2] = result;
                working.bitmap.data[idx + 3] = 255;
            }
        }
    }
    return working;
}

function binaryDilate(img, iterations = 1) {
    return morphologicalOp(img, iterations, Math.max, 0);
}

function binaryErode(img, iterations = 1) {
    return morphologicalOp(img, iterations, Math.min, 255);
}

export { GetImageSnippetTmpFile };

export default {
    GetImageSnippetTmpFile
};
