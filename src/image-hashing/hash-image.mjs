import stringSimilarity from "string-similarity";
import { imageHash } from "image-hash";
import log from "../logger/log.mjs";
import { round } from "../util.mjs";

export const dependencies = {
    imageHash
};

const logger = log.create({
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

function hashImage(imgUrl, cb) {
    logger.info(`Hashing image: ${formatImageSource(imgUrl)}`);
    // image-hash accepts either a plain path/URL string or a {url, ...fetchInit} request object;
    // only remote URLs need the header -- a local file path must stay a plain string so it still
    // takes the fs.readFile branch instead of being treated as a request object.
    const source = isRemoteUrl(imgUrl)
        ? { url: imgUrl, headers: REMOTE_IMAGE_REQUEST_HEADERS }
        : imgUrl;
    dependencies.imageHash(source, 16, true, (error, data) => {
        if (error) {
            return cb(error);
        }
        return cb(null, data);
    });
}

function compareHash(hashOne, hashTwo) {
    const HashLength = hashOne.length;
    let twoBitMatches = 0;
    let fourBitMatches = 0;
    hashOne.split("").forEach((c, index) => {
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
        twoBitMatches: round(twoBitMatches / (HashLength / 2), 2),
        fourBitMatches: round(fourBitMatches / (HashLength / 4), 2),
        stringCompare: round(stringSimilarity.compareTwoStrings(hashOne, hashTwo), 2)
    };
    logger.info(
        `Hash similarity: 2-bit ${toPercent(comparisonResults.twoBitMatches)}, 4-bit ${toPercent(comparisonResults.fourBitMatches)}, text ${toPercent(comparisonResults.stringCompare)}`
    );
    return comparisonResults;
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

export { compareHash, hashImage };

export default {
    compareHash,
    hashImage,
    dependencies,
    isRemoteUrl,
    REMOTE_IMAGE_REQUEST_HEADERS
};
