import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rejects } from "node:assert/strict";
import { assert } from "chai";
import { createOcrTrainingPlan } from "../../src/training/ocr-training-plan.mjs";
import {
    packageOcrTrainingCandidate,
    prepareOcrTrainingRun
} from "../../src/training/ocr-training-runner.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function createReviewedManifest(root) {
    const corpus = path.join(root, "corpus");
    await mkdir(corpus);
    const samples = [];
    for (const [id, text] of [
        ["one", "Sarkhan Unbroken"],
        ["two", "Yavimaya Coast"]
    ]) {
        const image = Buffer.from(`png:${id}`);
        const imagePath = path.join(corpus, `${id}.png`);
        const transcriptionPath = path.join(corpus, `${id}.gt.txt`);
        await writeFile(imagePath, image);
        await writeFile(transcriptionPath, text);
        samples.push({
            id,
            imagePath,
            transcriptionPath,
            imageSha256: sha256(image),
            transcriptionSha256: sha256(text),
            reviewed: true,
            text
        });
    }
    const manifestPath = path.join(corpus, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({ fixture: true }));
    return {
        path: manifestPath,
        directory: corpus,
        status: "reviewed",
        modelName: "eng_mtg",
        randomSeed: 20260808,
        trainRatio: 0.5,
        baseModel: {
            id: "official-eng-best",
            family: "tessdata_best",
            sha256: "8".repeat(64),
            source: { revision: "base-revision" }
        },
        samples
    };
}

describe("OCR training runner", () => {
    let root;

    beforeEach(async () => {
        root = await mkdtemp(path.join(os.tmpdir(), "mtg-ocr-training-runner-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it("prepares an exclusive run directory containing only reviewed manifest samples", async () => {
        const manifest = await createReviewedManifest(root);
        const runDirectory = path.join(root, "runs", "run-001");
        const plan = createOcrTrainingPlan(manifest, { runDirectory });

        const prepared = await prepareOcrTrainingRun(manifest, plan);

        assert.equal(prepared.readiness.total, 2);
        assert.equal(
            await readFile(path.join(runDirectory, "ground-truth/one.png"), "utf8"),
            "png:one"
        );
        assert.equal(
            await readFile(path.join(runDirectory, "ground-truth/one.gt.txt"), "utf8"),
            "Sarkhan Unbroken"
        );
        const recordedPlan = JSON.parse(
            await readFile(path.join(runDirectory, "training-plan.json"), "utf8")
        );
        assert.deepEqual(recordedPlan.readiness, { total: 2, train: 1, evaluation: 1 });
        assert.deepEqual(recordedPlan.provenance.sampleIds, ["one", "two"]);

        await rejects(
            prepareOcrTrainingRun(manifest, plan),
            /Training run directory already exists/
        );
    });

    it("removes a partial run directory when corpus preparation fails", async () => {
        const manifest = await createReviewedManifest(root);
        manifest.samples[1].imagePath = path.join(root, "missing.png");
        const runDirectory = path.join(root, "runs", "run-002");
        const plan = createOcrTrainingPlan(manifest, { runDirectory });

        await rejects(prepareOcrTrainingRun(manifest, plan), /Unable to prepare OCR training run/);
        await rejects(readFile(path.join(runDirectory, "training-plan.json")), /ENOENT/);
    });

    it("packages the trained output as a regression candidate with exact provenance", async () => {
        const manifest = await createReviewedManifest(root);
        const runDirectory = path.join(root, "runs", "run-003");
        const plan = createOcrTrainingPlan(manifest, { runDirectory, maxIterations: 500 });
        await prepareOcrTrainingRun(manifest, plan);
        const model = Buffer.from("trained model bytes");
        await writeFile(plan.finalModelPath, model);

        const result = await packageOcrTrainingCandidate(manifest, plan, {
            candidateId: "eng-mtg-run-003",
            sourceRevision: "local-run-003"
        });

        assert.equal(result.sha256, sha256(model));
        assert.equal(
            await readFile(path.join(runDirectory, "candidate/eng.traineddata"), "utf8"),
            "trained model bytes"
        );
        const candidateManifest = JSON.parse(
            await readFile(path.join(runDirectory, "candidate/manifest.json"), "utf8")
        );
        assert.deepEqual(candidateManifest, {
            version: 1,
            candidates: [
                {
                    id: "eng-mtg-run-003",
                    model: "eng.traineddata",
                    family: "tessdata_best-finetune",
                    sha256: sha256(model),
                    source: {
                        url: "https://github.com/dills122/MTG-Card-Analyzer",
                        revision: "local-run-003",
                        license:
                            "Apache-2.0; reviewed corpus provenance recorded in training-plan.json"
                    },
                    engine: { package: "tesseract.js", version: "3.0.3" }
                }
            ]
        });
    });

    it("refuses to package an empty or missing trained model", async () => {
        const manifest = await createReviewedManifest(root);
        const runDirectory = path.join(root, "runs", "run-004");
        const plan = createOcrTrainingPlan(manifest, { runDirectory });
        await prepareOcrTrainingRun(manifest, plan);

        await rejects(
            packageOcrTrainingCandidate(manifest, plan, {
                candidateId: "eng-mtg-run-004",
                sourceRevision: "local-run-004"
            }),
            /Trained OCR model does not exist/
        );
        await mkdir(path.dirname(plan.finalModelPath), { recursive: true });
        await writeFile(plan.finalModelPath, Buffer.alloc(0));
        await rejects(
            packageOcrTrainingCandidate(manifest, plan, {
                candidateId: "eng-mtg-run-004",
                sourceRevision: "local-run-004"
            }),
            /must be between 1 and/
        );
    });
});
