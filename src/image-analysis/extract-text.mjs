import { cleanString } from "../util.mjs";
import log from "../logger/log.mjs";
import Tesseract from "tesseract.js";
import { DEFAULT_OCR_LANGUAGE_PATH } from "./ocr-model.mjs";

const logger = log.create({
    isPretty: true
});
const maxNameTextCandidates = 12;
const pageSegmentationModes = Object.freeze({
    line: Tesseract.PSM.SINGLE_LINE,
    "raw-line": Tesseract.PSM.RAW_LINE,
    block: Tesseract.PSM.SINGLE_BLOCK,
    sparse: Tesseract.PSM.SPARSE_TEXT
});
let defaultSessionPromise;
let defaultSessionOptionsKey;
let defaultSessionTesseract;

/**
 * Run OCR on one or more preprocessed regions and select the strongest normalized result.
 * @param {Buffer|string|Array} imgBuffer image buffer, path, or prepared variants
 * @param {"name"|"soft-name"|"rotated-name"|"type"|"art"|"flavor"} type snippet type to inform normalization
 * @param {(err: Error|null, result: {cleanText: string, dirtyText: string}|null) => void} cb callback
 * @param {{logger?: {info: Function, error: Function}, session?: {recognize: Function}, cacheMethod?: string, langPath?: string, gzip?: boolean}} options runtime options
 */
function scanImage(imgBuffer, type, cb, options = {}) {
    const scanLogger = options.logger || logger;
    const tesseract = options.tesseract || Tesseract;
    const candidates = normalizeCandidates(imgBuffer, type);
    const regionLabel = candidates.map((candidate) => candidate.region).join(", ");
    const regionWord = candidates.length === 1 ? "region" : "regions";
    scanLogger.info(
        `OCR ${type || "unknown"}: ${candidates.length} ${regionWord} (${regionLabel})`
    );
    runCandidatesSequentially(candidates, type, scanLogger, options)
        .then((results) => {
            const best = selectBestResult(results, type);
            const textCandidates = uniqueTextCandidates([
                ...(best.textCandidates || []),
                ...results.flatMap((result) => result.textCandidates || [])
            ]);
            return cb(
                null,
                {
                    cleanText: best.cleanText,
                    dirtyText: best.dirtyText,
                    confidence: best.confidence,
                    bestVariant: best,
                    candidates: results,
                    textCandidates
                },
                tesseract
            );
        })
        .catch((err) => {
            scanLogger.error(err);
            return cb(err, null, tesseract);
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
            psm: item.psm,
            characterWhitelist: item.characterWhitelist
        }));
    }
    return [
        {
            buffer: input,
            region: type
        }
    ];
}

async function runCandidate(candidate, type, scanLogger, options = {}) {
    const session = options.session || (await getDefaultOcrSession(options));
    const result = await session.recognize(candidate.buffer, {
        region: candidate.region,
        psm: candidate.psm,
        characterWhitelist: candidate.characterWhitelist,
        logger: scanLogger
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
        buffer: candidate.buffer,
        textCandidates: isNameType(type)
            ? uniqueTextCandidates([
                  cleanedString,
                  ...normalizeNameLines(extractedText).flatMap(expandNameLineCandidates)
              ])
            : [cleanedString].filter(Boolean)
    };
}

function resolveWorkerOptions(options = {}) {
    return {
        cacheMethod: options.cacheMethod || "none",
        langPath: options.langPath || DEFAULT_OCR_LANGUAGE_PATH,
        gzip: typeof options.gzip === "boolean" ? options.gzip : false
    };
}

async function getDefaultOcrSession(options = {}) {
    const workerOptions = resolveWorkerOptions(options);
    const nextOptionsKey = JSON.stringify(workerOptions);
    const tesseract = options.tesseract || Tesseract;
    if (
        defaultSessionPromise &&
        (defaultSessionOptionsKey !== nextOptionsKey || defaultSessionTesseract !== tesseract)
    ) {
        await shutDown();
    }
    if (!defaultSessionPromise) {
        defaultSessionOptionsKey = nextOptionsKey;
        defaultSessionTesseract = tesseract;
        defaultSessionPromise = createOcrSession({ ...workerOptions, tesseract }).catch((error) => {
            defaultSessionPromise = undefined;
            defaultSessionOptionsKey = undefined;
            throw error;
        });
    }
    return defaultSessionPromise;
}

function normalizeOcrText(text, type) {
    return normalizeOcrTextByType(text, type || "");
}

function scoreOcrCandidate(result, type) {
    const confidence = Number(result?.confidence) || 0;
    if (!isNameType(type)) {
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
    if (isNameType(type)) {
        return normalizeNameText(text);
    }
    return normalizeGenericText(text);
}

function isNameType(type) {
    return type === "name" || type === "soft-name" || type === "rotated-name";
}

function normalizeNameText(text) {
    const lines = normalizeNameLines(text);

    if (!lines.length) {
        return "";
    }

    const bestLine = lines.reduce((best, current) => {
        if (!best) return current;
        return scoreNameLine(current) > scoreNameLine(best) ? current : best;
    }, lines[0]);

    return normalizeNameLine(bestLine);
}

function normalizeNameLines(text) {
    return normalizeUnicode(text || "")
        .split(/\r?\n/g)
        .map((line) => normalizeGenericText(line))
        .filter(Boolean);
}

function normalizeNameLine(line) {
    const pruned = pruneNameTokens(line);
    return pruned || line;
}

function expandNameLineCandidates(line) {
    const normalized = normalizeNameLine(line);
    const tokens = normalized.split(/\s+/g).filter(Boolean);
    const candidates = [normalized];
    if (tokens.length >= 2 && tokens.at(-1).replace(/[^A-Z]/g, "").length <= 2) {
        candidates.push(tokens.slice(0, -1).join(" "));
    }
    if (tokens.length >= 3) {
        candidates.push(tokens.slice(1).join(" "), tokens.slice(0, -1).join(" "));
    }
    if (tokens.length >= 4) {
        candidates.push(tokens.slice(1, -1).join(" "));
    }
    return candidates.filter((candidate) => candidate.replace(/[^A-Z0-9]/g, "").length >= 4);
}

function uniqueTextCandidates(candidates) {
    return [
        ...new Set(candidates.map((candidate) => String(candidate || "").trim()).filter(Boolean))
    ].slice(0, maxNameTextCandidates);
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

async function shutDown() {
    const pendingSession = defaultSessionPromise;
    defaultSessionPromise = undefined;
    defaultSessionOptionsKey = undefined;
    defaultSessionTesseract = undefined;
    if (pendingSession) {
        const session = await pendingSession;
        await session.terminate();
    }
}

async function createOcrSession(options = {}) {
    let progressLogger = () => {};
    const tesseract = options.tesseract || Tesseract;
    const worker = tesseract.createWorker({
        ...resolveWorkerOptions(options),
        logger: (message) => progressLogger(message)
    });
    try {
        await worker.load();
        await worker.loadLanguage("eng");
        await worker.initialize("eng");
    } catch (error) {
        await worker.terminate().catch(() => {});
        throw error;
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
                const recognitionParameters = {};
                const psm = pageSegmentationModes[recognitionOptions.psm];
                if (psm) recognitionParameters.tessedit_pageseg_mode = psm;
                if (recognitionOptions.characterWhitelist) {
                    recognitionParameters.tessedit_char_whitelist =
                        recognitionOptions.characterWhitelist;
                }
                if (Object.keys(recognitionParameters).length > 0) {
                    await worker.setParameters(recognitionParameters);
                }
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

export { scanImage, shutDown, createOcrSession, scoreOcrCandidate, selectBestResult };

export default {
    scanImage,
    shutDown,
    createOcrSession,
    scoreOcrCandidate,
    selectBestResult
};
