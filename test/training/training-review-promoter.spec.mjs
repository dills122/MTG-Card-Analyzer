import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rejects } from "node:assert/strict";
import { assert } from "chai";
import { promoteTrainingReviewBatch } from "../../src/training/training-review-promoter.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function createFixture(root) {
    const batchDirectory = path.join(root, "batch-001");
    const trainingDirectory = path.join(root, "training/ocr");
    await Promise.all([mkdir(batchDirectory), mkdir(trainingDirectory, { recursive: true })]);
    const samples = [];
    for (const [id, transcription] of [
        ["approved", "Adanto Vanguard"],
        ["concern", "Attunement"],
        ["rejected", "Mindstab Thrull"]
    ]) {
        const image = Buffer.from(`png:${id}`);
        const transcriptionBuffer = Buffer.from(transcription);
        await writeFile(path.join(batchDirectory, `${id}.png`), image);
        await writeFile(path.join(batchDirectory, `${id}.gt.txt`), transcriptionBuffer);
        samples.push({
            id,
            image: `${id}.png`,
            transcriptionFile: `${id}.gt.txt`,
            transcription,
            imageSha256: sha256(image),
            transcriptionSha256: sha256(transcriptionBuffer),
            sourceCaseId: `${id}-fixture`,
            region: "name-core",
            reviewed: false
        });
    }
    const reviewManifestPath = path.join(batchDirectory, "review-manifest.json");
    await writeFile(
        reviewManifestPath,
        JSON.stringify({
            version: 1,
            status: "unreviewed",
            generatedAt: "2026-08-09T00:00:00.000Z",
            sourceManifest: "/local/regression/manifest.json",
            rightsBasis: "reviewed-fan-content-policy",
            samples
        })
    );
    const trainingManifestPath = path.join(trainingDirectory, "manifest.json");
    await writeFile(
        trainingManifestPath,
        JSON.stringify({
            version: 1,
            status: "draft",
            modelName: "eng_mtg",
            randomSeed: 20260808,
            trainRatio: 0.9,
            baseModel: {
                id: "official-eng-best",
                family: "tessdata_best",
                sha256: "8".repeat(64),
                source: {
                    url: "https://github.com/tesseract-ocr/tessdata_best",
                    revision: "base-revision",
                    license: "Apache-2.0"
                }
            },
            samples: []
        })
    );
    return { batchDirectory, reviewManifestPath, trainingManifestPath };
}

describe("OCR training review promoter", () => {
    let root;

    beforeEach(async () => {
        root = await mkdtemp(path.join(os.tmpdir(), "mtg-training-promoter-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it("promotes only approved samples and preserves positive and concern provenance", async () => {
        const fixture = await createFixture(root);

        const result = await promoteTrainingReviewBatch({
            reviewManifestPath: fixture.reviewManifestPath,
            trainingManifestPath: fixture.trainingManifestPath,
            approved: [
                { id: "approved", notes: "This is a really good copy" },
                { id: "concern", concern: "Reviewer approved with concern" }
            ],
            rejectedIds: ["rejected"],
            now: () => new Date("2026-08-09T01:00:00.000Z")
        });

        assert.deepEqual(result, {
            approved: ["approved", "concern"],
            rejected: ["rejected"],
            trainingManifestPath: fixture.trainingManifestPath
        });
        const promoted = JSON.parse(await readFile(fixture.trainingManifestPath, "utf8"));
        assert.equal(promoted.status, "reviewed");
        assert.deepEqual(
            promoted.samples.map((sample) => sample.id),
            ["approved", "concern"]
        );
        assert.deepEqual(promoted.samples[1].review, {
            decision: "approved-with-concern",
            reviewedAt: "2026-08-09T01:00:00.000Z",
            notes: "Reviewer approved with concern"
        });
        assert.deepEqual(promoted.samples[0].review, {
            decision: "approved",
            reviewedAt: "2026-08-09T01:00:00.000Z",
            notes: "This is a really good copy"
        });
        assert.equal(promoted.samples[0].source.reference, "regression-fixture:approved-fixture");
        assert.equal(
            await readFile(path.join(root, "training/ocr/ground-truth/approved.gt.txt"), "utf8"),
            "Adanto Vanguard"
        );
        await rejects(
            readFile(path.join(root, "training/ocr/ground-truth/rejected.png")),
            /ENOENT/
        );
    });

    it("requires an explicit, non-overlapping decision for every staged sample", async () => {
        const fixture = await createFixture(root);

        await rejects(
            promoteTrainingReviewBatch({
                reviewManifestPath: fixture.reviewManifestPath,
                trainingManifestPath: fixture.trainingManifestPath,
                approved: [{ id: "approved" }],
                rejectedIds: ["rejected"]
            }),
            /Missing review decision for: concern/
        );
        await rejects(
            promoteTrainingReviewBatch({
                reviewManifestPath: fixture.reviewManifestPath,
                trainingManifestPath: fixture.trainingManifestPath,
                approved: [{ id: "approved" }, { id: "concern" }],
                rejectedIds: ["concern", "rejected"]
            }),
            /both approved and rejected: concern/
        );
    });

    it("rolls back copied files and leaves the manifest unchanged on hash drift", async () => {
        const fixture = await createFixture(root);
        const originalManifest = await readFile(fixture.trainingManifestPath, "utf8");
        await writeFile(path.join(fixture.batchDirectory, "concern.png"), "changed");

        await rejects(
            promoteTrainingReviewBatch({
                reviewManifestPath: fixture.reviewManifestPath,
                trainingManifestPath: fixture.trainingManifestPath,
                approved: [{ id: "approved" }, { id: "concern" }],
                rejectedIds: ["rejected"]
            }),
            /SHA-256 mismatch for training image concern/
        );
        assert.equal(await readFile(fixture.trainingManifestPath, "utf8"), originalManifest);
        await rejects(
            readFile(path.join(root, "training/ocr/ground-truth/approved.png")),
            /ENOENT/
        );
    });
});
