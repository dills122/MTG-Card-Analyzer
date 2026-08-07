import { cleanString } from "../util.mjs";
import log from "../logger/log.mjs";
import Tesseract from "tesseract.js";

const logger = log.create({
    isPretty: true
});

/**
 * Run OCR on one or more preprocessed regions with field-aware Tesseract config.
 * @param {Buffer|string|Array} imgBuffer image buffer, path, or prepared variants
 * @param {"name"|"type"|"art"|"flavor"} type snippet type to inform PSM/whitelist
 * @param {(err: Error|null, result: {cleanText: string, dirtyText: string}|null) => void} cb callback
 */
function ScanImage(imgBuffer, type, cb) {
    const candidates = normalizeCandidates(imgBuffer, type);
    logger.info(
        `extract-text::ScanImage:: type=${type || "unknown"} source=${describeImageSource(imgBuffer)} candidates=${summarizeCandidates(candidates)}`
    );
    runCandidatesSequentially(candidates, type)
        .then((results) => {
            const best = selectBestResult(results);
            return cb(
                null,
                {
                    cleanText: best.cleanText,
                    dirtyText: best.dirtyText,
                    confidence: best.confidence,
                    bestVariant: best,
                    candidates: results
                },
                Tesseract
            );
        })
        .catch((err) => {
            logger.error(err);
            return cb(err, null, Tesseract);
        });
}

async function runCandidatesSequentially(candidates, type) {
    const results = [];
    for (const candidate of candidates) {
        results.push(await runCandidate(candidate, type));
    }
    return results;
}

function normalizeCandidates(input, type) {
    if (Array.isArray(input)) {
        return input.map((item) => ({
            buffer: item.buffer || item,
            region: item.region || type,
            psm: resolvePsm(item.psm, type)
        }));
    }
    return [
        {
            buffer: input,
            region: type,
            psm: inferPsm(type)
        }
    ];
}

async function runCandidate(candidate, type) {
    const ocrConfig = getTesseractConfig(type, candidate.psm);
    const onProgress = buildProgressLogger(candidate.region);
    const result = await Tesseract.recognize(candidate.buffer, "eng", {
        ...ocrConfig,
        logger: (message) => {
            if (message.status === "recognizing text") {
                onProgress(message.progress);
            }
        }
    });
    const extractedText = (result && result.data && result.data.text) || result.text || "";
    const cleanedString = normalizeOcrText(extractedText, type);
    const confidence = (result && result.data && result.data.confidence) || 0;
    logger.info(
        `extract-text::result region=${candidate.region} confidence=${Math.round(confidence)} raw="${previewText(extractedText)}" normalized="${cleanedString}"`
    );
    return {
        region: candidate.region,
        cleanText: cleanedString,
        dirtyText: extractedText,
        confidence,
        buffer: candidate.buffer
    };
}

function getTesseractConfig(type, psm) {
    return {
        tessedit_char_whitelist:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,'- ",
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: resolvePsm(psm, type),
        oem: 1
    };
}

function inferPsm(type) {
    if (type === "name" || type === "type") {
        return 7; // single line of text
    }
    return 11; // sparse text as a safer fallback
}

function resolvePsm(psm, type) {
    if (typeof psm === "number") {
        return psm;
    }
    if (psm === "line") return 7;
    if (psm === "block") return 6;
    if (psm === "sparse") return 11;
    return inferPsm(type);
}

function normalizeOcrText(text, type) {
    return normalizeOcrTextByType(text, type || "");
}

function selectBestResult(results) {
    return results.reduce((best, current) => {
        if (!best) return current;
        if (scoreCandidate(current) > scoreCandidate(best)) return current;
        if (
            scoreCandidate(current) === scoreCandidate(best) &&
            current.confidence > best.confidence
        ) {
            return current;
        }
        return best;
    }, results[0]);
}

function normalizeOcrTextByType(text, type) {
    if (type === "name") {
        return normalizeNameText(text);
    }
    return normalizeGenericText(text);
}

function normalizeNameText(text) {
    const normalizedUnicode = normalizeUnicode(text || "");
    const lines = normalizedUnicode
        .split(/\r?\n/g)
        .map((line) => normalizeGenericText(line))
        .filter(Boolean);

    if (!lines.length) {
        return "";
    }

    const bestLine = lines.reduce((best, current) => {
        if (!best) return current;
        return scoreNameLine(current) > scoreNameLine(best) ? current : best;
    }, lines[0]);

    const pruned = pruneNameTokens(bestLine);
    return pruned || bestLine;
}

function normalizeGenericText(text) {
    let cleaned = cleanString(normalizeUnicode(text || ""));
    cleaned = cleaned.replace(/^[0-9]+\s*/, ""); // strip leading capture numbers
    cleaned = cleaned.replace(/[_]/g, " ");
    cleaned = cleaned.replace(/[^A-Za-z0-9\s'-]/g, " "); // keep tokens useful to fuzzy matching
    cleaned = cleaned.replace(/\s{2,}/g, " ");
    return cleaned.toUpperCase().trim();
}

function normalizeUnicode(text) {
    const mapped = (text || "")
        .replace(/\uFB00/g, "ff")
        .replace(/\uFB01/g, "fi")
        .replace(/\uFB02/g, "fl")
        .replace(/\uFB03/g, "ffi")
        .replace(/\uFB04/g, "ffl")
        .replace(/\u2018|\u2019/g, "'")
        .replace(/\u201C|\u201D/g, '"')
        .replace(/\u2013|\u2014/g, "-");
    return mapped.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function pruneNameTokens(cleanedLine) {
    const tokens = cleanedLine.split(/\s+/g).filter(Boolean);
    const filtered = tokens.filter((token) => isLikelyNameToken(token));
    if (!filtered.length) {
        return "";
    }
    return filtered.join(" ");
}

function isLikelyNameToken(token) {
    if (!/[A-Z]/.test(token)) {
        return false;
    }
    if (/^[0-9]+$/.test(token)) {
        return false;
    }
    if (token.length === 1 && token !== "X") {
        return false;
    }
    if (/(.)\1\1/.test(token)) {
        return false;
    }
    return true;
}

function scoreNameLine(line) {
    const tokens = line.split(/\s+/g).filter(Boolean);
    if (!tokens.length) return -100;

    let score = 0;
    const alphaTokens = tokens.filter((token) => /[A-Z]/.test(token)).length;
    score += alphaTokens * 8;
    score -= Math.abs(tokens.length - 2) * 4; // most MTG names are short
    score -= tokens.filter((token) => token.length === 1).length * 5;
    score -= tokens.filter((token) => /(.)\1\1/.test(token)).length * 8;
    score -= Math.max(0, line.length - 38) * 0.7;
    return score;
}

function scoreCandidate(candidate) {
    const confidence = Number(candidate.confidence || 0);
    const cleaned = candidate.cleanText || "";
    const tokens = cleaned.split(/\s+/g).filter(Boolean);
    if (!tokens.length) {
        return confidence - 30;
    }
    let quality = 0;
    quality += Math.min(cleaned.length, 28);
    quality -= Math.max(0, tokens.length - 4) * 6;
    quality -= tokens.filter((token) => token.length === 1).length * 4;
    quality -= tokens.filter((token) => /(.)\1\1/.test(token)).length * 8;
    if (candidate.region === "name-core") {
        quality += 8;
    } else if (candidate.region === "name-wide") {
        quality += 4;
    } else if (candidate.region === "top-band") {
        quality -= 2;
    }
    return confidence + quality;
}

function describeImageSource(input) {
    if (Array.isArray(input)) {
        return "variant-list";
    }
    if (Buffer.isBuffer(input)) {
        return "buffer";
    }
    if (typeof input === "string") {
        return input;
    }
    return typeof input;
}

function summarizeCandidates(candidates = []) {
    return candidates.map((candidate) => `${candidate.region}:${candidate.psm}`).join(",");
}

function buildProgressLogger(region) {
    let lastBucket = -1;
    return (progress = 0) => {
        const bucket = Math.min(100, Math.max(0, Math.floor(Number(progress) * 100)));
        if (bucket < 100 && bucket % 10 !== 0) {
            return;
        }
        if (bucket === lastBucket) {
            return;
        }
        lastBucket = bucket;
        logger.info(`extract-text::progress region=${region} progress=${bucket}%`);
    };
}

function previewText(text) {
    const normalized = String(text || "")
        .replace(/\s+/g, " ")
        .trim();
    const max = 140;
    if (normalized.length <= max) {
        return normalized;
    }
    return `${normalized.slice(0, max - 3)}...`;
}

function ShutDown() {
    Tesseract.terminate();
}

export const dependencies = { Tesseract };

export { ScanImage, ShutDown };

export default {
    ScanImage,
    ShutDown,
    dependencies
};
