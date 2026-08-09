import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertTrainingDataReady } from "./training-data-manifest.mjs";

const MAX_TRAINED_MODEL_BYTES = 128 * 1024 * 1024;
const CANDIDATE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const PROJECT_URL = "https://github.com/dills122/MTG-Card-Analyzer";

function requireNonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }
}

async function prepareOcrTrainingRun(manifest, plan) {
    const readiness = assertTrainingDataReady(manifest);
    const runDirectory = path.resolve(plan.runDirectory);
    await mkdir(path.dirname(runDirectory), { recursive: true });
    try {
        await mkdir(runDirectory);
    } catch (error) {
        if (error?.code === "EEXIST") {
            throw new Error(`Training run directory already exists: ${runDirectory}`, {
                cause: error
            });
        }
        throw error;
    }

    try {
        const groundTruthDirectory = path.join(runDirectory, "ground-truth");
        await Promise.all([mkdir(groundTruthDirectory), mkdir(path.join(runDirectory, "data"))]);
        for (const sample of manifest.samples) {
            const extension = path.extname(sample.imagePath).toLowerCase();
            await Promise.all([
                copyFile(
                    sample.imagePath,
                    path.join(groundTruthDirectory, `${sample.id}${extension}`)
                ),
                copyFile(
                    sample.transcriptionPath,
                    path.join(groundTruthDirectory, `${sample.id}.gt.txt`)
                )
            ]);
        }
        const recordedPlan = {
            version: 1,
            status: "prepared",
            readiness,
            resources: plan.resources,
            provenance: plan.provenance,
            command: {
                executable: plan.command.executable,
                args: plan.command.args
            }
        };
        await writeFile(
            path.join(runDirectory, "training-plan.json"),
            `${JSON.stringify(recordedPlan, null, 2)}\n`,
            { encoding: "utf8", flag: "wx" }
        );
        return { ...plan, readiness, groundTruthDirectory };
    } catch (error) {
        await rm(runDirectory, { recursive: true, force: true });
        throw new Error(`Unable to prepare OCR training run: ${error.message}`, { cause: error });
    }
}

async function readTrainedModel(modelPath) {
    let modelStats;
    try {
        modelStats = await stat(modelPath);
    } catch (error) {
        throw new Error(`Trained OCR model does not exist: ${modelPath}`, { cause: error });
    }
    if (!modelStats.isFile()) {
        throw new Error(`Trained OCR model is not a regular file: ${modelPath}`);
    }
    if (modelStats.size < 1 || modelStats.size > MAX_TRAINED_MODEL_BYTES) {
        throw new Error(`Trained OCR model must be between 1 and ${MAX_TRAINED_MODEL_BYTES} bytes`);
    }
    return readFile(modelPath);
}

async function packageOcrTrainingCandidate(manifest, plan, options = {}) {
    const { candidateId, sourceRevision } = options;
    requireNonEmptyString(candidateId, "candidateId");
    if (!CANDIDATE_ID_PATTERN.test(candidateId)) {
        throw new Error(
            "candidateId must use lowercase letters, numbers, dots, dashes, or underscores"
        );
    }
    requireNonEmptyString(sourceRevision, "sourceRevision");
    const model = await readTrainedModel(plan.finalModelPath);
    const modelSha256 = createHash("sha256").update(model).digest("hex");
    const candidateDirectory = path.join(plan.runDirectory, "candidate");
    try {
        await mkdir(candidateDirectory);
    } catch (error) {
        if (error?.code === "EEXIST") {
            throw new Error(`Training candidate directory already exists: ${candidateDirectory}`, {
                cause: error
            });
        }
        throw error;
    }

    const candidateManifest = {
        version: 1,
        candidates: [
            {
                id: candidateId,
                model: "eng.traineddata",
                family: "tessdata_best-finetune",
                sha256: modelSha256,
                source: {
                    url: PROJECT_URL,
                    revision: sourceRevision,
                    license: "Apache-2.0; reviewed corpus provenance recorded in training-plan.json"
                },
                engine: { package: "tesseract.js", version: "3.0.3" }
            }
        ]
    };
    try {
        await Promise.all([
            writeFile(path.join(candidateDirectory, "eng.traineddata"), model, { flag: "wx" }),
            writeFile(
                path.join(candidateDirectory, "manifest.json"),
                `${JSON.stringify(candidateManifest, null, 2)}\n`,
                { encoding: "utf8", flag: "wx" }
            )
        ]);
        return {
            candidateId,
            directory: candidateDirectory,
            manifestPath: path.join(candidateDirectory, "manifest.json"),
            modelPath: path.join(candidateDirectory, "eng.traineddata"),
            sha256: modelSha256,
            sizeBytes: model.length,
            trainingManifestPath: manifest.path
        };
    } catch (error) {
        await rm(candidateDirectory, { recursive: true, force: true });
        throw new Error(`Unable to package OCR training candidate: ${error.message}`, {
            cause: error
        });
    }
}

export { MAX_TRAINED_MODEL_BYTES, packageOcrTrainingCandidate, prepareOcrTrainingRun };
