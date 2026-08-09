function clampChannel(value) {
    return Math.max(0, Math.min(255, value));
}

/**
 * Apply the additive brightness semantics used by the project's original Jimp release.
 *
 * Jimp 1.x interprets brightness as a channel multiplier. The OCR tuning and regression
 * transform values are intentionally additive fractions of the full channel range, so keep
 * that contract explicit and independent of future image-library changes.
 *
 * @param {{bitmap: {data: Buffer|Uint8Array}}} image
 * @param {number} amount additive fraction in the inclusive range [-1, 1]
 * @returns {typeof image}
 */
function adjustBrightness(image, amount) {
    if (!Number.isFinite(amount) || amount < -1 || amount > 1) {
        throw new RangeError("Brightness amount must be a finite number between -1 and 1");
    }

    const { data } = image.bitmap;
    const offset = 255 * amount;
    for (let index = 0; index < data.length; index += 4) {
        data[index] = clampChannel(data[index] + offset);
        data[index + 1] = clampChannel(data[index + 1] + offset);
        data[index + 2] = clampChannel(data[index + 2] + offset);
    }
    return image;
}

export { adjustBrightness };

export default {
    adjustBrightness
};
