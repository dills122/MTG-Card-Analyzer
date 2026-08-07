import path from "node:path";
import jimp from "jimp";

function clampPercent(value = 0) {
    return Math.max(0, Math.min(0.45, value));
}

function applyCrop(image, crop) {
    const leftPercent = clampPercent(crop.left);
    const topPercent = clampPercent(crop.top);
    const rightPercent = clampPercent(crop.right);
    const bottomPercent = clampPercent(crop.bottom);
    const left = Math.round(image.bitmap.width * leftPercent);
    const top = Math.round(image.bitmap.height * topPercent);
    const width = Math.max(
        1,
        image.bitmap.width - left - Math.round(image.bitmap.width * rightPercent)
    );
    const height = Math.max(
        1,
        image.bitmap.height - top - Math.round(image.bitmap.height * bottomPercent)
    );
    image.crop(left, top, width, height);
}

async function materializeFixture(fixture, directory) {
    const transform = fixture.transform || {};
    if (Object.keys(transform).length === 0) {
        return fixture.imagePath;
    }

    const image = await jimp.read(fixture.imagePath);
    if (transform.crop) {
        applyCrop(image, transform.crop);
    }
    if (typeof transform.brightness === "number") {
        image.brightness(transform.brightness);
    }
    if (typeof transform.contrast === "number") {
        image.contrast(transform.contrast);
    }
    if (Number.isInteger(transform.blur) && transform.blur > 0) {
        image.gaussian(transform.blur);
    }
    if (typeof transform.rotate === "number" && transform.rotate !== 0) {
        image.rotate(transform.rotate, false);
    }
    if (transform.resize) {
        image.resize(transform.resize.width, transform.resize.height);
    }

    const safeId = fixture.id.replace(/[^a-z0-9_-]/gi, "-");
    const outputPath = path.join(directory, `${safeId}.png`);
    await image.writeAsync(outputPath);
    return outputPath;
}

export { applyCrop, materializeFixture };

export default {
    applyCrop,
    materializeFixture
};
