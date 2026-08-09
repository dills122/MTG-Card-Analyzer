import path from "node:path";

const TESSTRAIN_REVISION = "405346a3a67d8e4e049341d1da6a4b752e0b8351";
const LANGDATA_LSTM_REVISION = "07930fd9f246622c26eb5de794d9212ceac432d3";
const OCR_TRAINING_IMAGE = `mtg-card-analyzer/tesstrain:${TESSTRAIN_REVISION.slice(0, 12)}`;
const MIN_ITERATIONS = 1;
const MAX_ITERATIONS = 100_000;
const MIN_CPUS = 1;
const MAX_CPUS = 16;
const MIN_MEMORY_GB = 1;
const MAX_MEMORY_GB = 16;

function boundedInteger(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
}

function safeRunDirectory(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("runDirectory must be a non-empty path");
    }
    const absolutePath = path.resolve(value);
    if (absolutePath === path.parse(absolutePath).root) {
        throw new Error("runDirectory must not be a filesystem root");
    }
    if (absolutePath.includes(",")) {
        throw new Error(
            "runDirectory must not contain commas because Docker mount syntax uses them"
        );
    }
    return absolutePath;
}

function createOcrTrainingPlan(manifest, options = {}) {
    if (!manifest || typeof manifest !== "object") {
        throw new Error("A loaded OCR training-data manifest is required");
    }
    const runDirectory = safeRunDirectory(options.runDirectory);
    const maxIterations = boundedInteger(
        options.maxIterations ?? 10_000,
        MIN_ITERATIONS,
        MAX_ITERATIONS,
        "maxIterations"
    );
    const cpus = boundedInteger(options.cpus ?? 4, MIN_CPUS, MAX_CPUS, "cpus");
    const memoryGb = boundedInteger(
        options.memoryGb ?? 4,
        MIN_MEMORY_GB,
        MAX_MEMORY_GB,
        "memoryGb"
    );
    const uid = boundedInteger(options.uid ?? process.getuid?.() ?? 1000, 0, 2 ** 31 - 1, "uid");
    const gid = boundedInteger(options.gid ?? process.getgid?.() ?? 1000, 0, 2 ** 31 - 1, "gid");
    const outputDirectory = path.join(runDirectory, "data");
    const finalModelPath = path.join(outputDirectory, `${manifest.modelName}.traineddata`);

    const args = [
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--cpus",
        String(cpus),
        "--memory",
        `${memoryGb}g`,
        "--pids-limit",
        "512",
        "--user",
        `${uid}:${gid}`,
        "--env",
        "HOME=/tmp",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=1g",
        "--mount",
        `type=bind,src=${runDirectory},dst=/run`,
        OCR_TRAINING_IMAGE,
        "training",
        `MODEL_NAME=${manifest.modelName}`,
        "START_MODEL=eng",
        "TESSDATA=/opt/tessdata_best",
        "LANGDATA_DIR=/opt/langdata_lstm",
        "DATA_DIR=/run/data",
        `OUTPUT_DIR=/run/data/${manifest.modelName}`,
        "GROUND_TRUTH_DIR=/run/ground-truth",
        `MAX_ITERATIONS=${maxIterations}`,
        `RANDOM_SEED=${manifest.randomSeed}`,
        `RATIO_TRAIN=${manifest.trainRatio}`,
        "PSM=13"
    ];

    return {
        image: OCR_TRAINING_IMAGE,
        runDirectory,
        outputDirectory,
        finalModelPath,
        command: { executable: "docker", args },
        resources: { cpus, memoryGb },
        provenance: {
            tesstrainRevision: TESSTRAIN_REVISION,
            langdataLstmRevision: LANGDATA_LSTM_REVISION,
            image: OCR_TRAINING_IMAGE,
            baseModelId: manifest.baseModel.id,
            baseModelRevision: manifest.baseModel.source.revision,
            baseModelSha256: manifest.baseModel.sha256,
            modelName: manifest.modelName,
            maxIterations,
            psm: 13,
            randomSeed: manifest.randomSeed,
            trainRatio: manifest.trainRatio,
            sampleIds: manifest.samples.map((sample) => sample.id),
            samples: manifest.samples.map((sample) => ({
                id: sample.id,
                imageSha256: sample.imageSha256,
                transcriptionSha256: sample.transcriptionSha256
            }))
        }
    };
}

function createOcrTrainingImageBuildPlan(repositoryRoot) {
    if (typeof repositoryRoot !== "string" || repositoryRoot.trim().length === 0) {
        throw new Error("repositoryRoot must be a non-empty path");
    }
    const absoluteRoot = path.resolve(repositoryRoot);
    const context = path.join(absoluteRoot, "training/ocr");
    return {
        executable: "docker",
        args: [
            "build",
            "--file",
            path.join(context, "Dockerfile"),
            "--tag",
            OCR_TRAINING_IMAGE,
            context
        ]
    };
}

export {
    MAX_CPUS,
    MAX_ITERATIONS,
    MAX_MEMORY_GB,
    LANGDATA_LSTM_REVISION,
    OCR_TRAINING_IMAGE,
    TESSTRAIN_REVISION,
    createOcrTrainingImageBuildPlan,
    createOcrTrainingPlan
};
