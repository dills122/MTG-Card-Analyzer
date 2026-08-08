import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import jimp from "jimp";
import { assert } from "chai";
import {
    regions,
    cropRegion,
    computeGreyscaleStdDev,
    assessConfidence,
    cropSetSymbolFromImage,
    writeSetSymbolSnippet
} from "../../src/image-processing/smart-crop.mjs";
import { round, clamp } from "../../src/util.mjs";

const FIXTURE_PATH = path.resolve(
    "test-images/regression/scryfall/fin-570-vivi-ornitier-25ef2d44.jpg"
);

async function makeTempDir() {
    const dir = path.join(os.tmpdir(), `smart-crop-spec-${randomUUID()}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
}

async function checkerboardImage(width, height) {
    const img = await new jimp(width, height, 0xffffffff);
    const { data } = img.bitmap;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (width * y + x) * 4;
            const isBlack = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
            const value = isBlack ? 0 : 255;
            data[idx] = value;
            data[idx + 1] = value;
            data[idx + 2] = value;
            data[idx + 3] = 255;
        }
    }
    return img;
}

describe("Smart crop::", () => {
    describe("computeGreyscaleStdDev / assessConfidence::", () => {
        it("flags a solid-color image as low confidence", async () => {
            const img = await new jimp(100, 100, 0x808080ff);
            const stdDev = computeGreyscaleStdDev(img);
            assert.equal(stdDev, 0);
            const result = assessConfidence(img);
            assert.isTrue(result.lowConfidence);
            assert.match(result.reason, /flat region/);
        });

        it("does not flag a high-contrast checkerboard image", async () => {
            const img = await checkerboardImage(100, 100);
            const stdDev = computeGreyscaleStdDev(img);
            assert.isAbove(stdDev, 10);
            const result = assessConfidence(img);
            assert.isFalse(result.lowConfidence);
            assert.isUndefined(result.reason);
        });
    });

    describe("cropRegion / cropSetSymbolFromImage::", () => {
        it("crops the set-symbol region to hand-computed percent geometry", async () => {
            const width = 1000;
            const height = 1400;
            const img = await checkerboardImage(width, height);

            const { image, region } = cropRegion(img, regions.setSymbol);

            const expectedLeft = clamp(round(width * regions.setSymbol.leftPercent), 0, width - 1);
            const expectedTop = clamp(round(height * regions.setSymbol.topPercent), 0, height - 1);
            const expectedWidth = clamp(
                round(width * regions.setSymbol.widthPercent),
                1,
                width - expectedLeft
            );
            const expectedHeight = clamp(
                round(height * regions.setSymbol.heightPercent),
                1,
                height - expectedTop
            );

            assert.deepEqual(region, {
                left: expectedLeft,
                top: expectedTop,
                width: expectedWidth,
                height: expectedHeight
            });
            assert.equal(image.bitmap.width, expectedWidth);
            assert.equal(image.bitmap.height, expectedHeight);
        });

        it("returns confidence info alongside the crop", async () => {
            const img = await checkerboardImage(1000, 1400);
            const result = cropSetSymbolFromImage(img);
            assert.property(result, "image");
            assert.property(result, "region");
            assert.property(result, "lowConfidence");
        });

        it("crops a real card fixture to the expected proportions", async () => {
            const baseImage = await jimp.read(FIXTURE_PATH);
            const { width, height } = baseImage.bitmap;

            const { image, region } = cropSetSymbolFromImage(baseImage);

            assert.approximately(region.width / width, regions.setSymbol.widthPercent, 0.01);
            assert.approximately(region.height / height, regions.setSymbol.heightPercent, 0.01);
            assert.equal(image.bitmap.width, region.width);
            assert.equal(image.bitmap.height, region.height);
        });
    });

    describe("writeSetSymbolSnippet::", () => {
        let tempDir;

        beforeEach(async () => {
            tempDir = await makeTempDir();
        });

        afterEach(async () => {
            await fs.rm(tempDir, { recursive: true, force: true });
        });

        it("writes a cropped set-symbol snippet to the given directory", async () => {
            const filePath = await writeSetSymbolSnippet(FIXTURE_PATH, tempDir);
            assert.equal(path.dirname(filePath), tempDir);
            assert.equal(path.extname(filePath), path.extname(FIXTURE_PATH));
            const stat = await fs.stat(filePath);
            assert.isTrue(stat.isFile());
            assert.isAbove(stat.size, 0);
        });

        it("throws when the source image is too small", async () => {
            const smallImage = await new jimp(100, 100, 0xffffffff);
            const smallPath = path.join(tempDir, "small.png");
            await smallImage.writeAsync(smallPath);

            let caughtError;
            try {
                await writeSetSymbolSnippet(smallPath, tempDir);
            } catch (err) {
                caughtError = err;
            }
            assert.instanceOf(caughtError, Error);
            assert.equal(caughtError.message, "Image is to small");
        });

        it("throws when the crop lands on a low-confidence flat region", async () => {
            const flatImage = await new jimp(1000, 1400, 0x808080ff);
            const flatPath = path.join(tempDir, "flat.png");
            await flatImage.writeAsync(flatPath);

            let caughtError;
            try {
                await writeSetSymbolSnippet(flatPath, tempDir);
            } catch (err) {
                caughtError = err;
            }
            assert.instanceOf(caughtError, Error);
            assert.match(caughtError.message, /low confidence/);
        });
    });
});
