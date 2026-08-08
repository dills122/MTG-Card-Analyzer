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

function hashImage(imgUrl, cb) {
    logger.info(`Hashing image: ${formatImageSource(imgUrl)}`);
    dependencies.imageHash(imgUrl, 16, true, (error, data) => {
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
    dependencies
};
