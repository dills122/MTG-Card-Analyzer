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
 * @param {{logger?: {info: Function, error: Function}, session?: {recognize: Function}, cacheMethod?: string, langPath?: string, gzip?: boolean}} options runtime options
 */
function ScanImage(imgBuffer, type, cb, options = {}) {
    const scanLogger = options.logger || logger;
    const candidates = normalizeCandidates(imgBuffer, type);
    const regionLabel = candidates.map((candidate) => candidate.region).join(", ");
    const regionWord = candidates.length === 1 ? "region" : "regions";
    scanLogger.info(
        `OCR ${type || "unknown"}: ${candidates.length} ${regionWord} (${regionLabel})`
    );
    runCandidatesSequentially(candidates, type, scanLogger, options)
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

async function runCandidatesSequentially(candidates, type, scanLogger, options) {
    const results = [];
    for (const candidate of candidates) {
        results.push(await runCandidate(candidate, type, scanLogger, options));
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

async function runCandidate(candidate, type, scanLogger, options = {}) {
    const ocrConfig = getTesseractConfig(type, candidate.psm);
    const onProgress = buildProgressLogger(candidate.region, scanLogger);
    const result = options.session
        ? await options.session.recognize(candidate.buffer, {
              region: candidate.region,
              logger: scanLogger
          })
        : await Tesseract.recognize(candidate.buffer, "eng", {
              ...ocrConfig,
              // Tesseract v3 otherwise rewrites ./eng.traineddata for every worker. Multiple OCR
              // variants can race and truncate the bundled model, so treat the local cache as input.
              cacheMethod: "readOnly",
              ...(options.cacheMethod ? { cacheMethod: options.cacheMethod } : {}),
              ...(options.langPath ? { langPath: options.langPath } : {}),
              ...(typeof options.gzip === "boolean" ? { gzip: options.gzip } : {}),
              logger: (message) => {
                  if (message.status === "recognizing text") {
                      onProgress(message.progress);
                  }
              }
          });
    const extractedText = (result && result.data && result.data.text) || result.text || "";
    const cleanedString = normalizeOcrText(extractedText, type);
    const confidence = (result && result.data && result.data.confidence) || 0;
    scanLogger.info(
        `OCR ${candidate.region}: ${Math.round(confidence)}% confidence; "${previewText(extractedText)}" -> "${cleanedString}"`
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

function buildProgressLogger(region, progressLogger = logger) {
    let halfwayLogged = false;
    return (progress = 0) => {
        const value = Number(progress);
        if (halfwayLogged || value < 0.5 || value >= 1) {
            return;
        }
        halfwayLogged = true;
        progressLogger.info(`OCR ${region}: 50%`);
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

async function createOcrSession(options = {}) {
    let progressLogger = () => {};
    const worker = Tesseract.createWorker({
        // Match ScanImage's one-shot defaults while allowing regression runs to disable caching.
        cacheMethod: "readOnly",
        ...(options.cacheMethod ? { cacheMethod: options.cacheMethod } : {}),
        ...(options.langPath ? { langPath: options.langPath } : {}),
        ...(typeof options.gzip === "boolean" ? { gzip: options.gzip } : {}),
        logger: (message) => progressLogger(message)
    });
    try {
        await worker.load();
        await worker.loadLanguage("eng");
        await worker.initialize("eng");
    } catch (err) {
        await worker.terminate().catch(() => {});
        throw err;
    }

    let terminated = false;
    let hasRecognized = false;
    let operationQueue = Promise.resolve();
    return {
        recognize(image, recognitionOptions = {}) {
            if (terminated) {
                return Promise.reject(new Error("OCR session has been terminated"));
            }
            const operation = operationQueue.then(async () => {
                if (hasRecognized) {
                    // Tesseract learns adaptive character data while recognizing. Reinitialize
                    // its API between images so fixture results remain independent of run order.
                    await worker.initialize("eng");
                }
                hasRecognized = true;
                const sessionLogger = recognitionOptions.logger || options.logger || logger;
                const onProgress = buildProgressLogger(
                    recognitionOptions.region || "unknown",
                    sessionLogger
                );
                progressLogger = (message) => {
                    if (message.status === "recognizing text") {
                        onProgress(message.progress);
                    }
                };
                try {
                    return await worker.recognize(image);
                } finally {
                    progressLogger = () => {};
                }
            });
            operationQueue = operation.catch(() => {});
            return operation;
        },
        async terminate() {
            if (terminated) return;
            terminated = true;
            await operationQueue;
            await worker.terminate();
        }
    };
}

export const dependencies = { Tesseract };

export { ScanImage, ShutDown, createOcrSession, scoreOcrCandidate, selectBestResult };

export default {
    ScanImage,
    ShutDown,
    createOcrSession,
    scoreOcrCandidate,
    selectBestResult,
    dependencies
};
