import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_OCR_MODEL_BYTES = 128 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function requireObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
}

function requireString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }
}

function validateSource(source, label) {
    requireObject(source, label);
    requireString(source.url, `${label}.url`);
    requireString(source.revision, `${label}.revision`);
    requireString(source.license, `${label}.license`);
    let sourceUrl;
    try {
        sourceUrl = new URL(source.url);
    } catch {
        throw new Error(`${label}.url must be a valid URL`);
    }
    if (sourceUrl.protocol !== "https:") {
        throw new Error(`${label}.url must use HTTPS`);
    }
}

function validateEngine(engine, label) {
    requireObject(engine, label);
    requireString(engine.package, `${label}.package`);
    requireString(engine.version, `${label}.version`);
}

function validateOcrModelManifest(rawManifest, manifestPath) {
    requireObject(rawManifest, "OCR model manifest");
    if (rawManifest.version !== 1) {
        throw new Error(`Unsupported OCR model manifest version: ${rawManifest.version}`);
    }
    if (!Array.isArray(rawManifest.candidates) || rawManifest.candidates.length === 0) {
        throw new Error("OCR model manifest must contain at least one candidate");
    }

    const absoluteManifestPath = path.resolve(manifestPath);
    const manifestDirectory = path.dirname(absoluteManifestPath);
    const ids = new Set();
    const candidates = rawManifest.candidates.map((candidate, index) => {
        const label = `candidates[${index}]`;
        requireObject(candidate, label);
        requireString(candidate.id, `${label}.id`);
        if (!ID_PATTERN.test(candidate.id)) {
            throw new Error(
                `${label}.id must use lowercase letters, numbers, dots, dashes, or underscores`
            );
        }
        if (ids.has(candidate.id)) {
            throw new Error(`Duplicate OCR model candidate id: ${candidate.id}`);
        }
        ids.add(candidate.id);
        requireString(candidate.model, `${label}.model`);
        if (path.basename(candidate.model) !== "eng.traineddata") {
            throw new Error(`${label}.model must be named eng.traineddata`);
        }
        requireString(candidate.family, `${label}.family`);
        requireString(candidate.sha256, `${label}.sha256`);
        if (!SHA256_PATTERN.test(candidate.sha256)) {
            throw new Error(`${label}.sha256 must be a 64-character hexadecimal SHA-256`);
        }
        if (candidate.enabled !== undefined && typeof candidate.enabled !== "boolean") {
            throw new Error(`${label}.enabled must be a boolean`);
        }
        validateSource(candidate.source, `${label}.source`);
        validateEngine(candidate.engine, `${label}.engine`);

        const modelPath = path.resolve(manifestDirectory, candidate.model);
        return {
            ...candidate,
            sha256: candidate.sha256.toLowerCase(),
            modelPath,
            languagePath: path.dirname(modelPath)
        };
    });

    return {
        ...rawManifest,
        path: absoluteManifestPath,
        directory: manifestDirectory,
        candidates
    };
}

async function sha256File(filePath) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(filePath)) {
        hash.update(chunk);
    }
    return hash.digest("hex");
}

async function verifyCandidate(candidate) {
    let fileStats;
    try {
        fileStats = await stat(candidate.modelPath);
    } catch (error) {
        throw new Error(`OCR model candidate file does not exist: ${candidate.modelPath}`, {
            cause: error
        });
    }
    if (!fileStats.isFile()) {
        throw new Error(`OCR model candidate is not a regular file: ${candidate.modelPath}`);
    }
    if (fileStats.size === 0 || fileStats.size > MAX_OCR_MODEL_BYTES) {
        throw new Error(
            `OCR model candidate ${candidate.id} must be between 1 and ${MAX_OCR_MODEL_BYTES} bytes`
        );
    }
    const actualSha256 = await sha256File(candidate.modelPath);
    if (actualSha256 !== candidate.sha256) {
        throw new Error(
            `SHA-256 mismatch for OCR model candidate ${candidate.id}: expected ${candidate.sha256}, received ${actualSha256}`
        );
    }
    return { ...candidate, sizeBytes: fileStats.size };
}

async function loadOcrModelManifest(manifestPath) {
    const absolutePath = path.resolve(manifestPath);
    let rawManifest;
    try {
        rawManifest = JSON.parse(await readFile(absolutePath, "utf8"));
    } catch (error) {
        throw new Error(`Unable to read OCR model manifest ${absolutePath}: ${error.message}`, {
            cause: error
        });
    }
    const manifest = validateOcrModelManifest(rawManifest, absolutePath);
    const candidates = await Promise.all(manifest.candidates.map(verifyCandidate));
    return { ...manifest, candidates };
}

export { MAX_OCR_MODEL_BYTES, loadOcrModelManifest, sha256File, validateOcrModelManifest };

export default { loadOcrModelManifest, validateOcrModelManifest };
