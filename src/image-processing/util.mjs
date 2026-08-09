import { open } from "node:fs/promises";
import { Jimp, JimpMime } from "jimp";

const limits = Object.freeze({
    maximumFileBytes: 32 * 1024 * 1024,
    maximumRemoteBytes: 16 * 1024 * 1024,
    maximumWidth: 12_000,
    maximumHeight: 12_000,
    maximumPixels: 40_000_000,
    maximumRedirects: 3,
    requestTimeoutMs: 15_000
});

const allowedRemoteImageOrigins = new Set([
    "https://cards.scryfall.io",
    "https://img.scryfall.com"
]);

const jpegStartOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function invalidImage(reason) {
    return new Error(`Invalid or unsupported image: ${reason}`);
}

function assertDimensionsWithinLimits({ width, height, format }) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
        throw invalidImage("dimensions must be positive integers");
    }
    if (width > limits.maximumWidth || height > limits.maximumHeight) {
        throw invalidImage(
            `dimensions exceed ${limits.maximumWidth}x${limits.maximumHeight} pixels`
        );
    }
    if (width * height > limits.maximumPixels) {
        throw invalidImage(`decoded size exceeds ${limits.maximumPixels} pixels`);
    }
    return { width, height, format };
}

function parsePngDimensions(buffer) {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
        return undefined;
    }
    if (buffer.readUInt32BE(8) !== 13 || buffer.toString("ascii", 12, 16) !== "IHDR") {
        throw invalidImage("PNG does not start with a valid IHDR chunk");
    }
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        format: "png"
    };
}

function parseGifDimensions(buffer) {
    if (buffer.length < 10) return undefined;
    const signature = buffer.toString("ascii", 0, 6);
    if (signature !== "GIF87a" && signature !== "GIF89a") return undefined;
    return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8),
        format: "gif"
    };
}

function parseBmpDimensions(buffer) {
    if (buffer.length < 26 || buffer.toString("ascii", 0, 2) !== "BM") return undefined;
    const dibHeaderSize = buffer.readUInt32LE(14);
    if (dibHeaderSize === 12) {
        return {
            width: buffer.readUInt16LE(18),
            height: buffer.readUInt16LE(20),
            format: "bmp"
        };
    }
    if (dibHeaderSize < 40 || buffer.length < 26) {
        throw invalidImage("BMP has an unsupported DIB header");
    }
    return {
        width: Math.abs(buffer.readInt32LE(18)),
        height: Math.abs(buffer.readInt32LE(22)),
        format: "bmp"
    };
}

function parseJpegDimensions(buffer) {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;

    let offset = 2;
    while (offset + 1 < buffer.length) {
        if (buffer[offset] !== 0xff) {
            throw invalidImage("JPEG marker stream is malformed");
        }
        while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
        if (offset >= buffer.length) break;

        const marker = buffer[offset];
        offset += 1;
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > buffer.length) break;

        const segmentLength = buffer.readUInt16BE(offset);
        if (segmentLength < 2 || offset + segmentLength > buffer.length) {
            throw invalidImage("JPEG segment length is invalid");
        }
        if (jpegStartOfFrameMarkers.has(marker)) {
            if (segmentLength < 7) throw invalidImage("JPEG frame header is truncated");
            return {
                width: buffer.readUInt16BE(offset + 5),
                height: buffer.readUInt16BE(offset + 3),
                format: "jpeg"
            };
        }
        offset += segmentLength;
    }
    throw invalidImage("JPEG dimensions were not found before image data");
}

function getImageDimensionsFromBuffer(value) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (buffer.length < 1 || buffer.length > limits.maximumFileBytes) {
        throw invalidImage(`file must be between 1 and ${limits.maximumFileBytes} bytes`);
    }

    const dimensions =
        parsePngDimensions(buffer) ||
        parseJpegDimensions(buffer) ||
        parseGifDimensions(buffer) ||
        parseBmpDimensions(buffer);
    if (!dimensions) {
        throw invalidImage("expected JPEG, PNG, GIF, or BMP data");
    }
    return assertDimensionsWithinLimits(dimensions);
}

async function readBoundedFile(imagePath) {
    const handle = await open(imagePath, "r");
    try {
        const initialStats = await handle.stat();
        if (
            !initialStats.isFile() ||
            initialStats.size < 1 ||
            initialStats.size > limits.maximumFileBytes
        ) {
            throw invalidImage(`file must be between 1 and ${limits.maximumFileBytes} bytes`);
        }

        const buffer = Buffer.allocUnsafe(initialStats.size);
        let offset = 0;
        while (offset < buffer.length) {
            const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
            if (bytesRead === 0) break;
            offset += bytesRead;
        }
        const finalStats = await handle.stat();
        if (offset !== buffer.length || finalStats.size !== initialStats.size) {
            throw invalidImage("file changed while it was being read");
        }
        return buffer;
    } finally {
        await handle.close();
    }
}

function parseAllowedRemoteUrl(value, expectedOrigin) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw invalidImage("remote URL is invalid");
    }
    const allowedOrigin = expectedOrigin || url.origin;
    if (
        url.protocol !== "https:" ||
        !allowedRemoteImageOrigins.has(url.origin) ||
        url.origin !== allowedOrigin
    ) {
        throw invalidImage("remote URL must remain on an approved Scryfall image origin");
    }
    return url;
}

async function readBoundedResponse(response) {
    const contentLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(contentLength) && contentLength > limits.maximumRemoteBytes) {
        await response.body?.cancel?.();
        throw invalidImage(`remote body exceeds ${limits.maximumRemoteBytes} bytes`);
    }

    if (!response.body?.getReader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > limits.maximumRemoteBytes) {
            throw invalidImage(`remote body exceeds ${limits.maximumRemoteBytes} bytes`);
        }
        return buffer;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limits.maximumRemoteBytes) {
            await reader.cancel();
            throw invalidImage(`remote body exceeds ${limits.maximumRemoteBytes} bytes`);
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
}

async function downloadBoundedImage(
    source,
    { fetchImpl = globalThis.fetch, headers = {}, signal } = {}
) {
    let url = parseAllowedRemoteUrl(source);
    const expectedOrigin = url.origin;
    const requestSignal = signal || AbortSignal.timeout(limits.requestTimeoutMs);

    for (let redirects = 0; redirects <= limits.maximumRedirects; redirects += 1) {
        const response = await fetchImpl(url, {
            headers,
            redirect: "manual",
            signal: requestSignal
        });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers?.get?.("location");
            await response.body?.cancel?.();
            if (!location || redirects === limits.maximumRedirects) {
                throw invalidImage("remote redirect limit exceeded");
            }
            url = parseAllowedRemoteUrl(new URL(location, url).href, expectedOrigin);
            continue;
        }
        if (!response.ok) {
            await response.body?.cancel?.();
            throw new Error(`Remote image request failed with HTTP ${response.status}`);
        }
        return readBoundedResponse(response);
    }
    throw invalidImage("remote redirect limit exceeded");
}

function isRemoteImageSource(source) {
    return typeof source === "string" && /^https?:\/\//i.test(source);
}

async function readImageInput(source, options = {}) {
    const buffer = isRemoteImageSource(source)
        ? await downloadBoundedImage(source, options)
        : await readBoundedFile(source);
    const dimensions = getImageDimensionsFromBuffer(buffer);
    return { buffer, dimensions };
}

async function decodeImageInput({ buffer, dimensions }) {
    const decodeOptions =
        dimensions.format === "jpeg"
            ? {
                  [JimpMime.jpeg]: {
                      maxResolutionInMP: limits.maximumPixels / 1_000_000,
                      maxMemoryUsageInMB: 256
                  }
              }
            : undefined;
    const image = await Jimp.fromBuffer(buffer, decodeOptions);
    if (image.bitmap.width !== dimensions.width || image.bitmap.height !== dimensions.height) {
        throw invalidImage("decoded dimensions do not match the validated header");
    }
    return image;
}

async function readImage(source, options = {}) {
    return decodeImageInput(await readImageInput(source, options));
}

async function getImageDimensions(imagePath) {
    return getImageDimensionsFromBuffer(await readBoundedFile(imagePath));
}

export {
    allowedRemoteImageOrigins,
    decodeImageInput,
    downloadBoundedImage,
    getImageDimensions,
    getImageDimensionsFromBuffer,
    limits,
    readImage,
    readImageInput
};

export default {
    decodeImageInput,
    downloadBoundedImage,
    getImageDimensions,
    getImageDimensionsFromBuffer,
    limits,
    readImage,
    readImageInput
};
