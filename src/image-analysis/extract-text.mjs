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
    logger.info(
        `extract-text::ScanImage:: Scanning Card ${Buffer.isBuffer(imgBuffer) ? "Image Buffer" : imgBuffer}`
    );
    const candidates = normalizeCandidates(imgBuffer, type);
    Promise.all(candidates.map((candidate) => runCandidate(candidate, type)))
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
    const result = await Tesseract.recognize(candidate.buffer, "eng", {
        ...ocrConfig,
        logger: (message) => {
            if (message.status === "recognizing text") {
                logger.info(`Tesseract status: ${message.status} ${message.progress}`);
            }
        }
    });
    const extractedText = (result && result.data && result.data.text) || result.text || "";
    const cleanedString = normalizeOcrText(extractedText);
    const confidence = (result && result.data && result.data.confidence) || 0;
    logger.info(
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
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,'- ",
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

function selectBestResult(results) {
    return results.reduce(
        (best, current) => {
            if (!best) return current;
            if (current.confidence > best.confidence) return current;
            if (current.confidence === best.confidence && current.cleanText.length > best.cleanText.length) {
                return current;
            }
            return best;
        },
        results[0]
    );
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
