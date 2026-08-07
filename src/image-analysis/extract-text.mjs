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
 * @param {{logger?: {info: Function, error: Function}}} options runtime options
 */
function ScanImage(imgBuffer, type, cb, options = {}) {
    const scanLogger = options.logger || logger;
    scanLogger.info(
        `extract-text::ScanImage:: Scanning Card ${Buffer.isBuffer(imgBuffer) ? "Image Buffer" : imgBuffer}`
    );
    const candidates = normalizeCandidates(imgBuffer, type);
    Promise.all(candidates.map((candidate) => runCandidate(candidate, type, scanLogger, options)))
        .then((results) => {
            const best = selectBestResult(results, type);
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
            scanLogger.error(err);
            return cb(err, null, Tesseract);
        });
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

async function runCandidate(candidate, type, scanLogger, options = {}) {
    const ocrConfig = getTesseractConfig(type, candidate.psm);
    const result = await Tesseract.recognize(candidate.buffer, "eng", {
        ...ocrConfig,
        // Tesseract v3 otherwise rewrites ./eng.traineddata for every worker. Multiple OCR
        // variants can race and truncate the bundled model, so treat the local cache as input.
        cacheMethod: "readOnly",
        ...(options.cacheMethod ? { cacheMethod: options.cacheMethod } : {}),
        ...(options.langPath ? { langPath: options.langPath } : {}),
        ...(typeof options.gzip === "boolean" ? { gzip: options.gzip } : {}),
        logger: (message) => {
            if (message.status === "recognizing text") {
                scanLogger.info(`Tesseract status: ${message.status} ${message.progress}`);
            }
        }
    });
    const extractedText = (result && result.data && result.data.text) || result.text || "";
    const cleanedString = normalizeOcrText(extractedText);
    const confidence = (result && result.data && result.data.confidence) || 0;
    scanLogger.info(
        `Region "${candidate.region}" => confidence ${confidence} | raw "${extractedText}" | normalized "${cleanedString}"`
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

function normalizeOcrText(text) {
    let cleaned = cleanString(text || "");
    cleaned = cleaned.replace(/^[0-9]+\s*/, ""); // strip leading capture numbers
    cleaned = cleaned.replace(/[^\w\s'-]/g, " "); // strip punctuation that confuses fuzzy matching
    cleaned = cleaned.replace(/\s{2,}/g, " ");
    return cleaned.toUpperCase().trim();
}

function scoreOcrCandidate(result, type) {
    const confidence = Number(result?.confidence) || 0;
    if (type !== "name") {
        return confidence;
    }

    const cleanText = result?.cleanText || "";
    const alphanumericLength = cleanText.replace(/[^a-z0-9]/gi, "").length;
    const words = cleanText.split(/\s+/).filter(Boolean);
    const digitCount = (cleanText.match(/\d/g) || []).length;
    const lineCount = String(result?.dirtyText || "")
        .split(/\r?\n/)
        .filter((line) => line.trim()).length;
    const regionBonus = result?.region === "name-core" ? 8 : result?.region === "name-wide" ? 4 : 0;
    const shortTextPenalty = Math.max(0, 4 - alphanumericLength) * 15;
    const excessWordPenalty = Math.max(0, words.length - 5) * 5;
    const digitPenalty = digitCount * 2;
    const multilinePenalty = Math.max(0, lineCount - 1) * 4;

    return (
        confidence +
        regionBonus -
        shortTextPenalty -
        excessWordPenalty -
        digitPenalty -
        multilinePenalty
    );
}

function selectBestResult(results, type) {
    return results.reduce((best, current) => {
        if (!best) return current;
        const currentScore = scoreOcrCandidate(current, type);
        const bestScore = scoreOcrCandidate(best, type);
        if (currentScore > bestScore) return current;
        if (currentScore === bestScore && current.cleanText.length > best.cleanText.length) {
            return current;
        }
        return best;
    }, results[0]);
}

function ShutDown() {
    Tesseract.terminate();
}

export const dependencies = { Tesseract };

export { ScanImage, ShutDown, scoreOcrCandidate, selectBestResult };

export default {
    ScanImage,
    ShutDown,
    scoreOcrCandidate,
    selectBestResult,
    dependencies
};
