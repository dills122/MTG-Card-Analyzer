import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_TRAINING_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPTION_BYTES = 1024;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const IMAGE_EXTENSIONS = [".png", ".tif"];

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

function requireSha256(value, label) {
    requireString(value, label);
    if (!SHA256_PATTERN.test(value)) {
        throw new Error(`${label} must be a 64-character hexadecimal SHA-256`);
    }
}

function resolveContainedPath(directory, relativePath, label) {
    requireString(relativePath, label);
    if (path.isAbsolute(relativePath)) {
        throw new Error(`${label} must be relative to the manifest directory`);
    }
    const absolutePath = path.resolve(directory, relativePath);
    const relative = path.relative(directory, absolutePath);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`${label} must stay inside the manifest directory`);
    }
    return absolutePath;
}

function validateBaseModel(baseModel) {
    requireObject(baseModel, "baseModel");
    requireString(baseModel.id, "baseModel.id");
    if (baseModel.family !== "tessdata_best") {
        throw new Error("baseModel.family must be tessdata_best for fine-tuning");
    }
    requireSha256(baseModel.sha256, "baseModel.sha256");
    requireObject(baseModel.source, "baseModel.source");
    requireString(baseModel.source.url, "baseModel.source.url");
    requireString(baseModel.source.revision, "baseModel.source.revision");
    requireString(baseModel.source.license, "baseModel.source.license");
    let sourceUrl;
    try {
        sourceUrl = new URL(baseModel.source.url);
    } catch {
        throw new Error("baseModel.source.url must be a valid URL");
    }
    if (sourceUrl.protocol !== "https:") {
        throw new Error("baseModel.source.url must use HTTPS");
    }
}

function validateSample(sample, index, directory) {
    const label = `samples[${index}]`;
    requireObject(sample, label);
    requireString(sample.id, `${label}.id`);
    if (!ID_PATTERN.test(sample.id)) {
        throw new Error(
            `${label}.id must use lowercase letters, numbers, dots, dashes, or underscores`
        );
    }
    requireSha256(sample.imageSha256, `${label}.imageSha256`);
    requireSha256(sample.transcriptionSha256, `${label}.transcriptionSha256`);
    if (typeof sample.reviewed !== "boolean") {
        throw new Error(`${label}.reviewed must be a boolean`);
    }
    requireObject(sample.source, `${label}.source`);
    if (!["card-image", "synthetic"].includes(sample.source.kind)) {
        throw new Error(`${label}.source.kind must be card-image or synthetic`);
    }
    requireString(sample.source.reference, `${label}.source.reference`);
    requireString(sample.source.license, `${label}.source.license`);

    const imagePath = resolveContainedPath(directory, sample.image, `${label}.image`);
    const extension = path.extname(sample.image).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(extension)) {
        throw new Error(`${label}.image must be a .png or .tif line image`);
    }
    const expectedTranscription = `${sample.image.slice(0, -extension.length)}.gt.txt`;
    if (sample.transcription !== expectedTranscription) {
        throw new Error(
            `${label}.transcription must replace the image extension with .gt.txt (${expectedTranscription})`
        );
    }
    const transcriptionPath = resolveContainedPath(
        directory,
        sample.transcription,
        `${label}.transcription`
    );

    return {
        ...sample,
        imageSha256: sample.imageSha256.toLowerCase(),
        transcriptionSha256: sample.transcriptionSha256.toLowerCase(),
        imagePath,
        transcriptionPath
    };
}

function validateTrainingDataManifest(rawManifest, manifestPath) {
    requireObject(rawManifest, "training-data manifest");
    if (rawManifest.version !== 1) {
        throw new Error(`Unsupported training-data manifest version: ${rawManifest.version}`);
    }
    if (!["draft", "reviewed"].includes(rawManifest.status)) {
        throw new Error("status must be draft or reviewed");
    }
    requireString(rawManifest.modelName, "modelName");
    if (!ID_PATTERN.test(rawManifest.modelName)) {
        throw new Error(
            "modelName must use lowercase letters, numbers, dots, dashes, or underscores"
        );
    }
    if (!Number.isSafeInteger(rawManifest.randomSeed) || rawManifest.randomSeed < 0) {
        throw new Error("randomSeed must be a non-negative safe integer");
    }
    if (
        typeof rawManifest.trainRatio !== "number" ||
        rawManifest.trainRatio <= 0 ||
        rawManifest.trainRatio >= 1
    ) {
        throw new Error("trainRatio must be a number greater than 0 and less than 1");
    }
    validateBaseModel(rawManifest.baseModel);
    if (!Array.isArray(rawManifest.samples)) {
        throw new Error("samples must be an array");
    }

    const absoluteManifestPath = path.resolve(manifestPath);
    const directory = path.dirname(absoluteManifestPath);
    const samples = rawManifest.samples.map((sample, index) =>
        validateSample(sample, index, directory)
    );
    const ids = new Set();
    samples.forEach((sample) => {
        if (ids.has(sample.id)) {
            throw new Error(`Duplicate training sample id: ${sample.id}`);
        }
        ids.add(sample.id);
    });

    return {
        ...rawManifest,
        path: absoluteManifestPath,
        directory,
        baseModel: {
            ...rawManifest.baseModel,
            sha256: rawManifest.baseModel.sha256.toLowerCase()
        },
        samples
    };
}

function sha256Buffer(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

function containsControlCharacters(text) {
    return Array.from(text).some((character) => {
        const codePoint = character.charCodeAt(0);
        return codePoint <= 31 || codePoint === 127;
    });
}

async function readBoundedFile(filePath, maximumBytes, label) {
    let fileStats;
    try {
        fileStats = await stat(filePath);
    } catch (error) {
        throw new Error(`${label} does not exist: ${filePath}`, { cause: error });
    }
    if (!fileStats.isFile()) {
        throw new Error(`${label} is not a regular file: ${filePath}`);
    }
    if (fileStats.size === 0 || fileStats.size > maximumBytes) {
        throw new Error(`${label} must be between 1 and ${maximumBytes} bytes`);
    }
    return readFile(filePath);
}

function parseTranscription(buffer, sampleId) {
    const rawText = buffer.toString("utf8");
    if (!Buffer.from(rawText, "utf8").equals(buffer)) {
        throw new Error(`Training transcription ${sampleId} must be valid UTF-8`);
    }
    const text = rawText.endsWith("\n") ? rawText.slice(0, -1) : rawText;
    if (
        text.length === 0 ||
        text.trim() !== text ||
        text.includes("\n") ||
        text.includes("\r") ||
        containsControlCharacters(text)
    ) {
        throw new Error(
            `Training transcription ${sampleId} must contain exactly one non-empty line`
        );
    }
    if (text.normalize("NFC") !== text) {
        throw new Error(`Training transcription ${sampleId} must use NFC Unicode normalization`);
    }
    return text;
}

async function verifySample(sample) {
    const [image, transcription] = await Promise.all([
        readBoundedFile(sample.imagePath, MAX_TRAINING_IMAGE_BYTES, `Training image ${sample.id}`),
        readBoundedFile(
            sample.transcriptionPath,
            MAX_TRANSCRIPTION_BYTES,
            `Training transcription ${sample.id}`
        )
    ]);
    const actualImageSha256 = sha256Buffer(image);
    if (actualImageSha256 !== sample.imageSha256) {
        throw new Error(
            `SHA-256 mismatch for training image ${sample.id}: expected ${sample.imageSha256}, received ${actualImageSha256}`
        );
    }
    const actualTranscriptionSha256 = sha256Buffer(transcription);
    if (actualTranscriptionSha256 !== sample.transcriptionSha256) {
        throw new Error(
            `SHA-256 mismatch for training transcription ${sample.id}: expected ${sample.transcriptionSha256}, received ${actualTranscriptionSha256}`
        );
    }
    return { ...sample, text: parseTranscription(transcription, sample.id) };
}

async function loadTrainingDataManifest(manifestPath) {
    const absolutePath = path.resolve(manifestPath);
    let rawManifest;
    try {
        rawManifest = JSON.parse(await readFile(absolutePath, "utf8"));
    } catch (error) {
        throw new Error(`Unable to read training-data manifest ${absolutePath}: ${error.message}`, {
            cause: error
        });
    }
    const manifest = validateTrainingDataManifest(rawManifest, absolutePath);
    const samples = await Promise.all(manifest.samples.map(verifySample));
    return { ...manifest, samples };
}

function assertTrainingDataReady(manifest) {
    if (manifest.status !== "reviewed") {
        throw new Error("Training-data manifest status must be reviewed");
    }
    if (manifest.samples.some((sample) => sample.reviewed !== true)) {
        throw new Error("Training-data manifest contains unreviewed samples");
    }
    if (manifest.samples.length < 2) {
        throw new Error("Training-data manifest needs at least two samples");
    }
    const train = Math.floor(manifest.samples.length * manifest.trainRatio);
    const evaluation = manifest.samples.length - train;
    if (train < 1 || evaluation < 1) {
        throw new Error(
            "Training-data ratio must produce at least one train and evaluation sample"
        );
    }
    return { total: manifest.samples.length, train, evaluation };
}

export {
    MAX_TRAINING_IMAGE_BYTES,
    MAX_TRANSCRIPTION_BYTES,
    assertTrainingDataReady,
    loadTrainingDataManifest,
    validateTrainingDataManifest
};
