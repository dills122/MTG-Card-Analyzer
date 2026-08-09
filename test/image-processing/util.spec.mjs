import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assert } from "chai";
import { Jimp, JimpMime } from "jimp";
import {
    getImageDimensions,
    getImageDimensionsFromBuffer,
    limits,
    readImage
} from "../../src/image-processing/util.mjs";

const JPEG_FIXTURE = path.resolve(
    "test-images/regression/scryfall/fin-570-vivi-ornitier-25ef2d44.jpg"
);
const PNG_FIXTURE = path.resolve("test-images/QueenMarchesa.png");

function makePngHeader(width, height) {
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.writeUInt32BE(13, 8);
    buffer.write("IHDR", 12, "ascii");
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
}

async function captureError(operation) {
    try {
        await operation();
    } catch (error) {
        return error;
    }
    return undefined;
}

describe("Bounded image input::", function () {
    this.timeout(15000);

    it("reads and decodes supported JPEG and PNG files through the bounded buffer", async () => {
        const jpegDimensions = await getImageDimensions(JPEG_FIXTURE);
        const pngDimensions = await getImageDimensions(PNG_FIXTURE);
        const jpeg = await readImage(JPEG_FIXTURE);
        const png = await readImage(PNG_FIXTURE);

        assert.deepInclude(jpegDimensions, { width: 488, height: 680, format: "jpeg" });
        assert.deepInclude(pngDimensions, { width: 745, height: 1040, format: "png" });
        assert.equal(jpeg.bitmap.width, jpegDimensions.width);
        assert.equal(jpeg.bitmap.height, jpegDimensions.height);
        assert.equal(png.bitmap.width, pngDimensions.width);
        assert.equal(png.bitmap.height, pngDimensions.height);
    });

    it("reads and decodes bounded GIF and BMP inputs", async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "supported-images-"));
        try {
            const source = new Jimp({ width: 20, height: 30, color: 0x123456ff });
            for (const [extension, mime] of [
                ["gif", JimpMime.gif],
                ["bmp", JimpMime.bmp]
            ]) {
                const imagePath = path.join(tempDir, `card.${extension}`);
                await fs.writeFile(imagePath, await source.getBuffer(mime));
                const image = await readImage(imagePath);
                assert.deepInclude(image.bitmap, { width: 20, height: 30 });
            }
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it("rejects the ICNS, JXL, and HEIF signatures from the image-size advisories", async () => {
        const samples = [
            Buffer.from("icns00000010", "ascii"),
            Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]),
            Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])
        ];

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "unsupported-images-"));
        try {
            for (const [index, sample] of samples.entries()) {
                assert.throws(
                    () => getImageDimensionsFromBuffer(sample),
                    /expected JPEG, PNG, GIF, or BMP data/
                );
                const imagePath = path.join(tempDir, `advisory-${index}.jpg`);
                await fs.writeFile(imagePath, sample);
                const error = await captureError(() => readImage(imagePath));
                assert.instanceOf(error, Error);
                assert.match(error.message, /expected JPEG, PNG, GIF, or BMP data/);
            }
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it("rejects excessive dimensions and decoded pixel counts before Jimp runs", () => {
        assert.throws(
            () => getImageDimensionsFromBuffer(makePngHeader(limits.maximumWidth + 1, 100)),
            /dimensions exceed/
        );
        assert.throws(
            () => getImageDimensionsFromBuffer(makePngHeader(10_000, 5_000)),
            /decoded size exceeds/
        );
    });

    it("rejects a source file over the byte limit without allocating its contents", async () => {
        const tempPath = path.join(os.tmpdir(), `oversized-image-${randomUUID()}.png`);
        const handle = await fs.open(tempPath, "w");
        try {
            await handle.truncate(limits.maximumFileBytes + 1);
        } finally {
            await handle.close();
        }

        try {
            const error = await captureError(() => getImageDimensions(tempPath));
            assert.instanceOf(error, Error);
            assert.match(error.message, /file must be between 1 and/);
        } finally {
            await fs.rm(tempPath, { force: true });
        }
    });

    it("downloads Scryfall images with manual redirects, request headers, and byte limits", async () => {
        const fixture = await fs.readFile(JPEG_FIXTURE);
        const calls = [];
        const fetchImpl = async (url, init) => {
            calls.push({ url: String(url), init });
            if (calls.length === 1) {
                return new Response(null, {
                    status: 302,
                    headers: { location: "/normal/front/a/b/card.jpg" }
                });
            }
            return new Response(fixture, {
                status: 200,
                headers: { "content-length": String(fixture.length) }
            });
        };

        const image = await readImage("https://cards.scryfall.io/redirect/card.jpg", {
            fetchImpl,
            headers: { "User-Agent": "test-agent" }
        });

        assert.equal(image.bitmap.width, 488);
        assert.lengthOf(calls, 2);
        assert.equal(calls[0].init.redirect, "manual");
        assert.equal(calls[1].init.headers["User-Agent"], "test-agent");
        assert.equal(calls[1].url, "https://cards.scryfall.io/normal/front/a/b/card.jpg");
    });

    it("does not forward headers across a cross-origin redirect", async () => {
        let calls = 0;
        const fetchImpl = async () => {
            calls += 1;
            return new Response(null, {
                status: 302,
                headers: { location: "https://example.test/stolen.jpg" }
            });
        };

        const error = await captureError(() =>
            readImage("https://cards.scryfall.io/normal/front/a/b/card.jpg", {
                fetchImpl,
                headers: { Authorization: "secret" }
            })
        );

        assert.equal(calls, 1);
        assert.instanceOf(error, Error);
        assert.match(error.message, /must remain on an approved Scryfall image origin/);
    });

    it("rejects an oversized remote body from Content-Length before reading it", async () => {
        const fetchImpl = async () =>
            new Response(null, {
                status: 200,
                headers: { "content-length": String(limits.maximumRemoteBytes + 1) }
            });

        const error = await captureError(() =>
            readImage("https://cards.scryfall.io/normal/front/a/b/card.jpg", { fetchImpl })
        );

        assert.instanceOf(error, Error);
        assert.match(error.message, /remote body exceeds/);
    });
});
