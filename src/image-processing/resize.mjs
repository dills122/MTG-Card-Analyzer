import _ from "lodash";
import jimp from "jimp";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { GetImageDimensions } from "./util.mjs";

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
    borderPercent: 0.0535
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

/**
 * Crop and preprocess a snippet, returning a JPEG buffer.
 * @param {string} imgPath path to source image
 * @param {"name"|"type"|"art"|"flavor"} type snippet type
 * @returns {Promise<Buffer>} processed image buffer
 */
async function GetImageSnippet(imgPath, type) {
    const img = await buildSnippetImage(imgPath, type);
    const imgBuffer = await img.getBufferAsync("image/jpeg");
    return imgBuffer;
}

/**
 * Crop and preprocess a snippet, writing to a new file in cwd.
 */
async function GetImageSnippetFile(imgPath, type) {
    const ext = path.extname(imgPath) || ".jpg";
    const filePath = `${randomUUID()}${ext}`;
    const img = await buildSnippetImage(imgPath, type);
    await img.writeAsync(filePath);
    return filePath;
}

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

function GetAlteredDimensions(dimensions, type) {
    if (type === "name") {
        return {
            width: _.round(dimensions.width * constants.name.widthPercent),
            height: _.round(dimensions.height * constants.name.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.borderPercent)
        };
    }
    if (type === "type") {
        return {
            width: _.round(dimensions.width * constants.type.widthPercent),
            height: _.round(dimensions.height * constants.type.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.type.topPercent)
        };
    }
    if (type === "art") {
        return {
            width: _.round(dimensions.width * constants.art.widthPercent),
            height: _.round(dimensions.height * constants.art.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.art.topPercent)
        };
    }
    if (type === "flavor") {
        return {
            width: _.round(dimensions.width * constants.flavor.widthPercent),
            height: _.round(dimensions.height * constants.flavor.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.flavor.topPercent)
        };
    }
    throw new Error(`Unsupported snippet type "${type}"`);
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

    if (shouldInvert(img)) {
        img.invert();
    }

    img = binaryDilate(img, preprocessConfig.dilationPasses);
    img = binaryErode(img, preprocessConfig.erosionPasses);
    img = await padAndScale(
        img,
        preprocessConfig.padding,
        preprocessConfig.minOutputWidth,
        preprocessConfig.scaleFactor
    );
    img = sharpen(img);
    return img;
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

function binaryDilate(img, iterations = 1) {
    let working = img.clone();
    for (let iter = 0; iter < iterations; iter++) {
        const source = Buffer.from(working.bitmap.data);
        const { width, height } = working.bitmap;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let max = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const nx = x + kx;
                        const ny = y + ky;
                        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                        const nIdx = (width * ny + nx) * 4;
                        const value = source[nIdx];
                        if (value > max) {
                            max = value;
                        }
                    }
                }
                const idx = (width * y + x) * 4;
                working.bitmap.data[idx] = max;
                working.bitmap.data[idx + 1] = max;
                working.bitmap.data[idx + 2] = max;
                working.bitmap.data[idx + 3] = 255;
            }
        }
    }
    return working;
}

function binaryErode(img, iterations = 1) {
    let working = img.clone();
    for (let iter = 0; iter < iterations; iter++) {
        const source = Buffer.from(working.bitmap.data);
        const { width, height } = working.bitmap;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let min = 255;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const nx = x + kx;
                        const ny = y + ky;
                        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                        const nIdx = (width * ny + nx) * 4;
                        const value = source[nIdx];
                        if (value < min) {
                            min = value;
                        }
                    }
                }
                const idx = (width * y + x) * 4;
                working.bitmap.data[idx] = min;
                working.bitmap.data[idx + 1] = min;
                working.bitmap.data[idx + 2] = min;
                working.bitmap.data[idx + 3] = 255;
            }
        }
    }
    return working;
}

async function padAndScale(img, padding, minWidth) {
    const padded = await new jimp(
        img.bitmap.width + padding * 2,
        img.bitmap.height + padding * 2,
        0xffffffff
    );
    padded.composite(img, padding, padding);
    const targetWidth = Math.max(
        minWidth,
        Math.round(padded.bitmap.width * preprocessConfig.scaleFactor)
    );
    padded.resize(targetWidth, jimp.AUTO);
    return padded;
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

export { GetImageSnippet, GetImageSnippetFile, GetImageSnippetTmpFile };

export default {
    GetImageSnippet,
    GetImageSnippetFile,
    GetImageSnippetTmpFile
};
