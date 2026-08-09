import stringSimilarity from "string-similarity";
import { imageHash } from "image-hash";
import { JimpMime } from "jimp";
import log from "../logger/log.mjs";
import { round } from "../util.mjs";
import { decodeImageInput, readImageInput } from "../image-processing/util.mjs";

const defaultLogger = log.create({
    isPretty: true
});

// Scryfall's image CDN (cards.scryfall.io) returns HTTP 400 for a header-less request -- Node's
// global fetch (what the image-hash package uses under the hood) sends no User-Agent by default,
// so every remote hash was failing outright. Same header value as scryfall-api/http-client.mjs's
// REQUEST_HEADERS; duplicated locally (like regression-fixtures.mjs's own copy) rather than
// importing across the image-hashing/scryfall-api boundary for one constant.
export const REMOTE_IMAGE_REQUEST_HEADERS = {
    "User-Agent": "MTG-Card-Analyzer/0.2 (+https://github.com/dills122/MTG-Card-Analyzer)",
    Accept: "image/*"
};

export function isRemoteUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function createHashing({
    imageHash: hashImageSource = imageHash,
    loadImageInput = readImageInput,
    decodeImage = decodeImageInput,
    logger = defaultLogger
} = {}) {
    async function prepareHashSource(imgUrl, options) {
        const input = await loadImageInput(imgUrl, options);
        if (input.dimensions.format === "jpeg" || input.dimensions.format === "png") {
            return {
                data: input.buffer,
                ext: input.dimensions.format === "jpeg" ? JimpMime.jpeg : JimpMime.png
            };
        }

        // image-hash only decodes JPEG/PNG/WebP. Preserve the scanner's bounded GIF/BMP input
        // contract by decoding the already-validated bytes and normalizing them to PNG first.
        const image = await decodeImage(input);
        return { data: await image.getBuffer(JimpMime.png), ext: JimpMime.png };
    }

    function hashImage(imgUrl, cb) {
        logger.info(`Hashing image: ${formatImageSource(imgUrl)}`);
        const options = isRemoteUrl(imgUrl) ? { headers: REMOTE_IMAGE_REQUEST_HEADERS } : {};
        prepareHashSource(imgUrl, options).then(
            (source) => {
                // Never let image-hash reopen a user path or perform its own unbounded fetch. Its
                // buffer form receives bytes already capped, signature-checked, and dimension-checked
                // by the shared image-input boundary.
                hashImageSource(source, 16, true, (error, data) => {
                    if (error) {
                        return cb(error);
                    }
                    return cb(null, data);
                });
            },
            (error) => cb(error)
        );
    }

    function compareHash(hashOne, hashTwo) {
        const hashLength = hashOne.length;
        let twoBitMatches = 0;
        let fourBitMatches = 0;
        hashOne.split("").forEach((_character, index) => {
            if (index % 2 === 0) {
                const hashOneDoubleStr = hashOne.slice(index - 2, index);
                const hashTwoDoubleStr = hashTwo.slice(index - 2, index);
                twoBitMatches += hashOneDoubleStr === hashTwoDoubleStr ? 1 : 0;
            }
            if (index % 4 === 0) {
                const hashOneQuadStr = hashOne.slice(index - 4, index);
                const hashTwoQuadStr = hashTwo.slice(index - 4, index);
                fourBitMatches += hashOneQuadStr === hashTwoQuadStr ? 1 : 0;
            }
        });
        const comparisonResults = {
            twoBitMatches: round(twoBitMatches / (hashLength / 2), 2),
            fourBitMatches: round(fourBitMatches / (hashLength / 4), 2),
            stringCompare: round(stringSimilarity.compareTwoStrings(hashOne, hashTwo), 2)
        };
        logger.info(
            `Hash similarity: 2-bit ${toPercent(comparisonResults.twoBitMatches)}, 4-bit ${toPercent(comparisonResults.fourBitMatches)}, text ${toPercent(comparisonResults.stringCompare)}`
        );
        return comparisonResults;
    }

    return Object.freeze({ compareHash, hashImage });
}

function formatImageSource(source) {
    const value = String(source || "");
    if (!value) {
        return "unknown source";
    }
    if (/^https?:\/\//i.test(value)) {
        try {
            const url = new URL(value);
            const filename = url.pathname.split("/").filter(Boolean).pop() || "image";
            return `${url.hostname}/${filename}`;
        } catch {
            return "invalid URL";
        }
    }
    return value.split(/[\\/]/).filter(Boolean).pop() || "unknown source";
}

function toPercent(score) {
    return `${Math.round(Number(score) * 100)}%`;
}

const hashing = createHashing();
const { compareHash, hashImage } = hashing;

export { compareHash, hashImage };

export default {
    compareHash,
    hashImage,
    createHashing,
    isRemoteUrl,
    REMOTE_IMAGE_REQUEST_HEADERS
};
