import { assert } from "chai";
import path from "node:path";
import sinon from "sinon";
import jimp from "jimp";
import os from "node:os";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { prepareOcrVariants } from "../../src/image-processing/ocr-preprocessing.mjs";

async function makeTempDir() {
    const dir = path.join(os.tmpdir(), `ocr-preprocessing-spec-${randomUUID()}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
}

describe("OCR preprocessing::", () => {
    it("builds a single soft rules-text fallback region", async () => {
        const fixturePath = path.resolve(
            "test-images/regression/scryfall/fin-570-vivi-ornitier-25ef2d44.jpg"
        );

        const { variants, previewPath, sourceSizing } = await prepareOcrVariants(
            fixturePath,
            "rules-name"
        );

        assert.lengthOf(variants, 1);
        assert.equal(variants[0].region, "rules-name");
        assert.equal(variants[0].psm, "block");
        assert.isAbove(variants[0].image.bitmap.width, 900);
        assert.isUndefined(previewPath);
        assert.deepEqual(sourceSizing, { upscaleFactor: 1, upscaled: false });
    });

    describe("undersized sources (GitHub issue #156)::", () => {
        it("reaches OCR (instead of rejecting the image) and reports the upscale used", async () => {
            const fixturePath = path.resolve("test-images/red-1.jpg");
            const logger = { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };

            const { variants, sourceSizing } = await prepareOcrVariants(fixturePath, "name", {
                logger
            });

            assert.isNotEmpty(variants);
            assert.isTrue(sourceSizing.upscaled);
            assert.approximately(sourceSizing.upscaleFactor, 1.36, 0.01);
            assert.isTrue(logger.warn.calledOnce);
            assert.match(logger.warn.firstCall.args[0], /undersized/);
        });

        it("still rejects a source too degraded to be a recoverable upscale", async () => {
            const tempDir = await makeTempDir();
            try {
                const tinyImage = await new jimp(100, 100, 0xffffffff);
                const tinyPath = path.join(tempDir, "tiny.png");
                await tinyImage.writeAsync(tinyPath);

                let caughtError;
                try {
                    await prepareOcrVariants(tinyPath, "name");
                } catch (err) {
                    caughtError = err;
                }
                assert.instanceOf(caughtError, Error);
                assert.equal(caughtError.message, "Image is to small");
            } finally {
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        });
    });
});
