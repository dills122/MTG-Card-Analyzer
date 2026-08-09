import jimp from "jimp";

// Shared jimp binarization/preprocessing helpers for ocr-preprocessing.mjs -- previously
// duplicated byte-identical across multiple preprocessing modules. One implementation now.

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

// invertPivot: mean luminance below this is treated as dark-background/light-text, which gets
// inverted so text stays dark-on-light for OCR. Caller-supplied since each file's
// preprocessConfig tunes its own value.
function shouldInvert(img, invertPivot) {
    const { data, width, height } = img.bitmap;
    let sum = 0;
    for (let idx = 0; idx < data.length; idx += 4) {
        sum += data[idx];
    }
    const mean = sum / (width * height);
    return mean < invertPivot;
}

function sharpen(img) {
    const kernel = [
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
    ];
    return img.convolute(kernel);
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

export { computeOtsuThreshold, applyThreshold, shouldInvert, sharpen, padAndScale };

export default { computeOtsuThreshold, applyThreshold, shouldInvert, sharpen, padAndScale };
