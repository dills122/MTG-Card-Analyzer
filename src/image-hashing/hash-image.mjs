import {
    compareFingerprints,
    evaluatePdqMatch,
    fingerprintImage,
    parseFingerprint,
    PDQ_STARTING_POLICY,
    serializeFingerprint
} from "image-fingerprint/node";
import { JimpMime } from "jimp";
import log from "../logger/log.mjs";
import { round } from "../util.mjs";
import { decodeImageInput, readImageInput } from "../image-processing/util.mjs";

const defaultLogger = log.create({
    isPretty: true
});

export const FINGERPRINT_OPTIONS = Object.freeze({ algorithm: "pdq-v1" });
export const FINGERPRINT_MATCH_POLICY = PDQ_STARTING_POLICY;

// Scryfall's image CDN (cards.scryfall.io) returns HTTP 400 for a header-less request. Remote
// fetching remains at the application's bounded input boundary; image-fingerprint receives only
// the validated bytes and never reopens a user-controlled path or URL.
export const REMOTE_IMAGE_REQUEST_HEADERS = {
    "User-Agent": "MTG-Card-Analyzer/0.2 (+https://github.com/dills122/MTG-Card-Analyzer)",
    Accept: "image/*"
};

export function isRemoteUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
}

function legacyBlockHash(value) {
    if (!/^[a-f0-9]{64}$/i.test(value)) {
        return undefined;
    }
    return {
        schemaVersion: 1,
        algorithm: "blockhash-v1",
        encoding: "hex",
        hash: value.toLowerCase(),
        bitLength: 256,
        parameters: { bitsPerSide: 16, method: 2 }
    };
}

function readStoredFingerprint(value) {
    const serialized = String(value || "").trim();
    try {
        return parseFingerprint(serialized);
    } catch {
        const legacy = legacyBlockHash(serialized);
        if (legacy) {
            return legacy;
        }
        throw new Error("Stored image fingerprint is invalid");
    }
}

function incompatibleResult(reason) {
    return {
        comparable: false,
        reason,
        similarity: 0,
        distance: null,
        bitLength: 0,
        leftQuality: null,
        rightQuality: null,
        minQuality: null,
        eligible: false,
        matches: false
    };
}

export function createHashing({
    fingerprintImage: fingerprintImageSource = fingerprintImage,
    loadImageInput = readImageInput,
    decodeImage = decodeImageInput,
    logger = defaultLogger
} = {}) {
    async function prepareHashSource(imgUrl, options) {
        const input = await loadImageInput(imgUrl, options);
        if (input.dimensions.format === "jpeg" || input.dimensions.format === "png") {
            return input.buffer;
        }

        // image-fingerprint decodes JPEG, PNG, and WebP. Preserve the scanner's bounded GIF/BMP
        // input contract by decoding already-validated bytes and normalizing them to PNG first.
        const image = await decodeImage(input);
        return image.getBuffer(JimpMime.png);
    }

    function hashImage(imgUrl, cb) {
        logger.info(`Fingerprinting image: ${formatImageSource(imgUrl)} (PDQ v1)`);
        const options = isRemoteUrl(imgUrl) ? { headers: REMOTE_IMAGE_REQUEST_HEADERS } : {};
        prepareHashSource(imgUrl, options)
            .then((source) => fingerprintImageSource(source, FINGERPRINT_OPTIONS))
            .then(
                (fingerprint) => cb(null, serializeFingerprint(fingerprint)),
                (error) => cb(error)
            );
    }

    function compareHash(hashOne, hashTwo) {
        let first;
        let second;
        try {
            first = readStoredFingerprint(hashOne);
            second = readStoredFingerprint(hashTwo);
        } catch (error) {
            logger.warn(error.message);
            return incompatibleResult("invalid-fingerprint");
        }

        const comparison = compareFingerprints(first, second);
        if (!comparison.comparable) {
            logger.info(`Image fingerprints are not comparable: ${comparison.reason}`);
            return incompatibleResult(comparison.reason);
        }

        const similarity = round(1 - comparison.normalizedDistance, 4);
        let eligible = true;
        let matches = false;
        if (first.algorithm === "pdq-v1" && second.algorithm === "pdq-v1") {
            const policyResult = evaluatePdqMatch(first, second, FINGERPRINT_MATCH_POLICY);
            eligible = policyResult.eligible;
            matches = policyResult.matches;
        } else {
            matches = similarity >= 0.75;
        }
        const leftQuality = first.algorithm === "pdq-v1" ? first.quality : null;
        const rightQuality = second.algorithm === "pdq-v1" ? second.quality : null;
        const minQuality =
            leftQuality === null || rightQuality === null
                ? null
                : Math.min(leftQuality, rightQuality);
        const result = {
            comparable: true,
            algorithm: comparison.algorithm,
            similarity,
            distance: comparison.distance,
            bitLength: comparison.bitLength,
            leftQuality,
            rightQuality,
            minQuality,
            eligible,
            matches
        };
        logger.info(
            `Fingerprint similarity: ${toPercent(result.similarity)} (distance ${result.distance}/${result.bitLength}, minimum quality ${result.minQuality ?? "n/a"})`
        );
        return result;
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
    REMOTE_IMAGE_REQUEST_HEADERS,
    FINGERPRINT_OPTIONS,
    FINGERPRINT_MATCH_POLICY
};
