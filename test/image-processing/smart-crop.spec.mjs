import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Jimp } from "jimp";
import { assert } from "chai";
import {
    regions,
    getRegionTemplates,
    cropRegion,
    cropTextRegion,
    computeGreyscaleStdDev,
    assessConfidence,
    assertOcrSourceSizeOk,
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
    const img = new Jimp({ width, height, color: 0xffffffff });
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

function fillRectangle(img, left, top, width, height, color) {
    for (let y = top; y < top + height; y++) {
        for (let x = left; x < left + width; x++) {
            img.setPixelColor(color, x, y);
        }
    }
}

describe("Smart crop::", () => {
    describe("computeGreyscaleStdDev / assessConfidence::", () => {
        it("flags a solid-color image as low confidence", async () => {
            const img = new Jimp({ width: 100, height: 100, color: 0x808080ff });
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

        it("centers a real set icon in a bounded square crop with padding", async () => {
            const baseImage = await Jimp.read(FIXTURE_PATH);
            const { image, region, searchRegion, contentDetected, lowConfidence } =
                cropSetSymbolFromImage(baseImage);

            assert.isTrue(contentDetected);
            assert.isFalse(lowConfidence);
            assert.equal(region.width, region.height);
            assert.isBelow(region.width * region.height, searchRegion.width * searchRegion.height);
            assert.isAtLeast(region.left, 0);
            assert.isAtMost(region.left + region.width, baseImage.bitmap.width);
            assert.isAtLeast(region.top, 0);
            assert.isAtMost(region.top + region.height, baseImage.bitmap.height);
            assert.equal(image.bitmap.width, region.width);
            assert.equal(image.bitmap.height, region.height);
        });

        it("keeps an off-center symbol whole with buffer on every side", () => {
            const img = new Jimp({ width: 600, height: 800, color: 0xb8b8b8ff });
            const search = cropRegion(img, regions.setSymbolSearch).region;
            fillRectangle(img, search.left, search.top + 15, search.width, 2, 0x202020ff);
            fillRectangle(
                img,
                search.left,
                search.top + search.height - 16,
                search.width,
                2,
                0x202020ff
            );
            const icon = {
                left: search.left + 80,
                top: search.top + 38,
                width: 30,
                height: 34
            };
            fillRectangle(img, icon.left, icon.top, icon.width, icon.height, 0x151515ff);
            fillRectangle(
                img,
                icon.left + 5,
                icon.top + 5,
                icon.width - 10,
                icon.height - 10,
                0xe07020ff
            );

            const result = cropSetSymbolFromImage(img);

            assert.isTrue(result.contentDetected);
            assert.isFalse(result.lowConfidence);
            assert.isBelow(result.region.left, icon.left);
            assert.isBelow(result.region.top, icon.top);
            assert.isAbove(result.region.left + result.region.width, icon.left + icon.width);
            assert.isAbove(result.region.top + result.region.height, icon.top + icon.height);
            assert.equal(result.region.width, result.region.height);
            assert.isBelow(result.region.width, search.width / 2);
        });

        it("marks an ambiguous symbol search as low confidence", () => {
            const img = new Jimp({ width: 600, height: 800, color: 0x808080ff });

            const result = cropSetSymbolFromImage(img);

            assert.isFalse(result.contentDetected);
            assert.isTrue(result.lowConfidence);
            assert.match(result.reason, /edges were not detected/);
        });
    });

    describe("getRegionTemplates::", () => {
        it("returns the name templates for type 'name'", () => {
            assert.equal(getRegionTemplates("name"), regions.name);
        });

        it("returns the type templates for type 'type'", () => {
            assert.equal(getRegionTemplates("type"), regions.type);
        });

        it("returns the rules-name templates for type 'rules-name'", () => {
            assert.equal(getRegionTemplates("rules-name"), regions["rules-name"]);
        });

        it("falls back to default templates for an unknown type", () => {
            assert.equal(getRegionTemplates("unknown-type"), regions.default);
        });
    });

    describe("cropRegion with OCR-style templates::", () => {
        it("crops using a template that also carries key/psm/mode metadata", async () => {
            const img = await checkerboardImage(1000, 1400);
            const template = regions.name[0];

            const { image, region } = cropRegion(img, template);

            assert.equal(
                region.width,
                clamp(round(1000 * template.widthPercent), 1, 1000 - region.left)
            );
            assert.equal(image.bitmap.width, region.width);
            assert.equal(image.bitmap.height, region.height);
        });

        it("trims an oversized text window while preserving every glyph and padding", () => {
            const img = new Jimp({ width: 400, height: 120, color: 0xd8d8d8ff });
            const glyphs = [90, 112, 138, 165, 205, 230].map((left) => ({
                left,
                top: 42,
                width: 12,
                height: 30
            }));
            glyphs.forEach((glyph) =>
                fillRectangle(img, glyph.left, glyph.top, glyph.width, glyph.height, 0x101010ff)
            );

            const result = cropTextRegion(img, {
                leftPercent: 0,
                topPercent: 0,
                widthPercent: 1,
                heightPercent: 1
            });
            const lastGlyph = glyphs[glyphs.length - 1];

            assert.isTrue(result.contentDetected);
            assert.isBelow(result.region.width, img.bitmap.width / 2);
            assert.isBelow(result.region.height, img.bitmap.height / 2);
            assert.isBelow(result.region.left, glyphs[0].left);
            assert.isBelow(result.region.top, glyphs[0].top);
            assert.isAbove(
                result.region.left + result.region.width,
                lastGlyph.left + lastGlyph.width
            );
            assert.isAbove(
                result.region.top + result.region.height,
                lastGlyph.top + lastGlyph.height
            );
        });

        it("falls back to the template when no text edges are detectable", () => {
            const img = new Jimp({ width: 400, height: 120, color: 0xd8d8d8ff });
            const template = {
                leftPercent: 0.1,
                topPercent: 0.2,
                widthPercent: 0.8,
                heightPercent: 0.5
            };

            const result = cropTextRegion(img, template);
            const expected = cropRegion(img, template);

            assert.isFalse(result.contentDetected);
            assert.deepEqual(result.region, expected.region);
        });

        it("preserves the full template for multi-line OCR blocks", () => {
            const img = new Jimp({ width: 400, height: 120, color: 0xd8d8d8ff });
            fillRectangle(img, 90, 20, 120, 20, 0x101010ff);
            fillRectangle(img, 150, 75, 140, 20, 0x101010ff);
            const template = {
                leftPercent: 0,
                topPercent: 0,
                widthPercent: 1,
                heightPercent: 1,
                psm: "block"
            };

            const result = cropTextRegion(img, template);

            assert.isFalse(result.contentDetected);
            assert.deepEqual(result.region, { left: 0, top: 0, width: 400, height: 120 });
        });

        it("preserves the template when detected text touches its search boundary", () => {
            const img = new Jimp({ width: 400, height: 120, color: 0xd8d8d8ff });
            fillRectangle(img, 0, 0, 180, 30, 0x101010ff);

            const result = cropTextRegion(img, {
                leftPercent: 0,
                topPercent: 0,
                widthPercent: 1,
                heightPercent: 1,
                psm: "line"
            });

            assert.isFalse(result.contentDetected);
            assert.deepEqual(result.region, { left: 0, top: 0, width: 400, height: 120 });
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
            const smallImage = new Jimp({ width: 100, height: 100, color: 0xffffffff });
            const smallPath = path.join(tempDir, "small.png");
            await smallImage.write(smallPath);

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
            const flatImage = new Jimp({ width: 1000, height: 1400, color: 0x808080ff });
            const flatPath = path.join(tempDir, "flat.png");
            await flatImage.write(flatPath);

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

    describe("assertOcrSourceSizeOk::", () => {
        it("reports no upscaling needed when the source already meets the OCR minimum", () => {
            const sizing = assertOcrSourceSizeOk({ width: 360, height: 500 });
            assert.deepEqual(sizing, { upscaleFactor: 1, upscaled: false });
        });

        it("permits and reports an upscale for a source within the recoverable range", () => {
            // 265x370 -- the real-world fixture from GitHub issue #156.
            const sizing = assertOcrSourceSizeOk({ width: 265, height: 370 });
            assert.isTrue(sizing.upscaled);
            assert.approximately(sizing.upscaleFactor, 1.36, 0.01);
        });

        it("rejects a source too far below the minimum to be a recoverable upscale", () => {
            let caughtError;
            try {
                assertOcrSourceSizeOk({ width: 100, height: 100 });
            } catch (err) {
                caughtError = err;
            }
            assert.instanceOf(caughtError, Error);
            assert.equal(caughtError.message, "Image is to small");
        });
    });
});
