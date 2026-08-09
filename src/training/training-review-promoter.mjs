import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    MAX_TRAINING_IMAGE_BYTES,
    MAX_TRANSCRIPTION_BYTES,
    assertTrainingDataReady,
    loadTrainingDataManifest
} from "./training-data-manifest.mjs";

const MAX_REVIEW_MANIFEST_BYTES = 1024 * 1024;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function requireString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }
}

function safeChildPath(directory, relativePath, label) {
    requireString(relativePath, label);
    if (path.isAbsolute(relativePath)) {
        throw new Error(`${label} must be relative`);
    }
    const absolute = path.resolve(directory, relativePath);
    const relative = path.relative(directory, absolute);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`${label} must stay inside the review batch`);
    }
    return absolute;
}

async function readJsonFile(filePath, maximumBytes, label) {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile() || fileStats.size < 1 || fileStats.size > maximumBytes) {
        throw new Error(`${label} must be a regular file between 1 and ${maximumBytes} bytes`);
    }
    try {
        return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
        throw new Error(`Unable to parse ${label}: ${error.message}`, { cause: error });
    }
}

function validateDecisions(reviewManifest, approved, rejectedIds) {
    if (!Array.isArray(reviewManifest.samples) || reviewManifest.samples.length === 0) {
        throw new Error("Review manifest must contain staged samples");
    }
    if (!Array.isArray(approved) || !Array.isArray(rejectedIds)) {
        throw new Error("Approved and rejected decisions must be arrays");
    }
    const approvedById = new Map();
    for (const decision of approved) {
        requireString(decision?.id, "Approved sample ID");
        if (!ID_PATTERN.test(decision.id)) {
            throw new Error(`Unsafe approved sample ID: ${decision.id}`);
        }
        if (approvedById.has(decision.id)) {
            throw new Error(`Duplicate approved sample ID: ${decision.id}`);
        }
        if (decision.concern !== undefined) {
            requireString(decision.concern, `Concern for ${decision.id}`);
            if (decision.concern.length > 500) {
                throw new Error(`Concern for ${decision.id} must be 500 characters or fewer`);
            }
        }
        approvedById.set(decision.id, decision);
    }
    const rejected = new Set();
    for (const id of rejectedIds) {
        requireString(id, "Rejected sample ID");
        if (!ID_PATTERN.test(id)) {
            throw new Error(`Unsafe rejected sample ID: ${id}`);
        }
        if (rejected.has(id)) {
            throw new Error(`Duplicate rejected sample ID: ${id}`);
        }
        rejected.add(id);
    }
    const overlap = [...approvedById.keys()].filter((id) => rejected.has(id));
    if (overlap.length > 0) {
        throw new Error(`Samples cannot be both approved and rejected: ${overlap.join(", ")}`);
    }
    const stagedIds = new Set(reviewManifest.samples.map((sample) => sample.id));
    const unknown = [...approvedById.keys(), ...rejected].filter((id) => !stagedIds.has(id));
    if (unknown.length > 0) {
        throw new Error(`Review decisions reference unknown samples: ${unknown.join(", ")}`);
    }
    const missing = [...stagedIds].filter((id) => !approvedById.has(id) && !rejected.has(id));
    if (missing.length > 0) {
        throw new Error(`Missing review decision for: ${missing.join(", ")}`);
    }
    return { approvedById, rejected };
}

async function verifyReviewFile(filePath, expectedHash, maximumBytes, label) {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile() || fileStats.size < 1 || fileStats.size > maximumBytes) {
        throw new Error(`${label} must be a regular file between 1 and ${maximumBytes} bytes`);
    }
    const data = await readFile(filePath);
    const actualHash = createHash("sha256").update(data).digest("hex");
    if (actualHash !== expectedHash) {
        throw new Error(
            `SHA-256 mismatch for ${label}: expected ${expectedHash}, received ${actualHash}`
        );
    }
}

async function promoteTrainingReviewBatch(options = {}) {
    const {
        reviewManifestPath,
        trainingManifestPath,
        approved,
        rejectedIds,
        now = () => new Date()
    } = options;
    requireString(reviewManifestPath, "reviewManifestPath");
    requireString(trainingManifestPath, "trainingManifestPath");
    const absoluteReviewManifest = path.resolve(reviewManifestPath);
    const absoluteTrainingManifest = path.resolve(trainingManifestPath);
    const reviewDirectory = path.dirname(absoluteReviewManifest);
    const trainingDirectory = path.dirname(absoluteTrainingManifest);
    const [reviewManifest, trainingManifest] = await Promise.all([
        readJsonFile(absoluteReviewManifest, MAX_REVIEW_MANIFEST_BYTES, "review manifest"),
        readJsonFile(absoluteTrainingManifest, MAX_REVIEW_MANIFEST_BYTES, "training manifest")
    ]);
    if (reviewManifest.version !== 1) {
        throw new Error(`Unsupported review manifest version: ${reviewManifest.version}`);
    }
    requireString(reviewManifest.rightsBasis, "review manifest rightsBasis");
    const { approvedById, rejected } = validateDecisions(reviewManifest, approved, rejectedIds);
    const existingIds = new Set((trainingManifest.samples || []).map((sample) => sample.id));
    const approvedSamples = reviewManifest.samples.filter((sample) => approvedById.has(sample.id));
    for (const sample of approvedSamples) {
        if (existingIds.has(sample.id)) {
            throw new Error(`Training manifest already contains sample: ${sample.id}`);
        }
        const sourceImage = safeChildPath(reviewDirectory, sample.image, `${sample.id} image`);
        const sourceTranscription = safeChildPath(
            reviewDirectory,
            sample.transcriptionFile,
            `${sample.id} transcription`
        );
        await Promise.all([
            verifyReviewFile(
                sourceImage,
                sample.imageSha256,
                MAX_TRAINING_IMAGE_BYTES,
                `training image ${sample.id}`
            ),
            verifyReviewFile(
                sourceTranscription,
                sample.transcriptionSha256,
                MAX_TRANSCRIPTION_BYTES,
                `training transcription ${sample.id}`
            )
        ]);
    }

    const groundTruthDirectory = path.join(trainingDirectory, "ground-truth");
    await mkdir(groundTruthDirectory, { recursive: true });
    const copiedFiles = [];
    const temporaryManifest = path.join(
        trainingDirectory,
        `.manifest.promotion-${process.pid}-${Date.now()}.json`
    );
    try {
        const reviewedAt = now().toISOString();
        const promotedSamples = [];
        for (const sample of approvedSamples) {
            const decision = approvedById.get(sample.id);
            const extension = path.extname(sample.image).toLowerCase();
            const image = `ground-truth/${sample.id}${extension}`;
            const transcription = `ground-truth/${sample.id}.gt.txt`;
            const destinationImage = path.join(trainingDirectory, image);
            const destinationTranscription = path.join(trainingDirectory, transcription);
            await copyFile(
                path.join(reviewDirectory, sample.image),
                destinationImage,
                constants.COPYFILE_EXCL
            );
            copiedFiles.push(destinationImage);
            await copyFile(
                path.join(reviewDirectory, sample.transcriptionFile),
                destinationTranscription,
                constants.COPYFILE_EXCL
            );
            copiedFiles.push(destinationTranscription);
            promotedSamples.push({
                id: sample.id,
                image,
                transcription,
                imageSha256: sample.imageSha256,
                transcriptionSha256: sample.transcriptionSha256,
                reviewed: true,
                source: {
                    kind: "card-image",
                    reference: `regression-fixture:${sample.sourceCaseId}`,
                    license: reviewManifest.rightsBasis
                },
                review: {
                    decision: decision.concern ? "approved-with-concern" : "approved",
                    reviewedAt,
                    ...(decision.concern ? { notes: decision.concern } : {})
                }
            });
        }
        const proposedManifest = {
            ...trainingManifest,
            status: "reviewed",
            samples: [...(trainingManifest.samples || []), ...promotedSamples]
        };
        await writeFile(temporaryManifest, `${JSON.stringify(proposedManifest, null, 4)}\n`, {
            encoding: "utf8",
            flag: "wx"
        });
        const verifiedManifest = await loadTrainingDataManifest(temporaryManifest);
        assertTrainingDataReady(verifiedManifest);
        await rename(temporaryManifest, absoluteTrainingManifest);
        return {
            approved: approvedSamples.map((sample) => sample.id),
            rejected: [...rejected],
            trainingManifestPath: absoluteTrainingManifest
        };
    } catch (error) {
        await Promise.all([
            ...copiedFiles.map((filePath) => rm(filePath, { force: true })),
            rm(temporaryManifest, { force: true })
        ]);
        throw error;
    }
}

export { MAX_REVIEW_MANIFEST_BYTES, promoteTrainingReviewBatch, validateDecisions };
