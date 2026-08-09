import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rejects } from "node:assert/strict";
import { assert } from "chai";
import { stageTrainingReviewBatch } from "../../src/training/training-review-stager.mjs";

function regressionManifest() {
    return {
        path: "/fixtures/manifest.json",
        cases: [
            {
                id: "candidate-one",
                enabled: false,
                imagePath: "/fixtures/one.jpg",
                expected: { name: "Candidate One" }
            },
            {
                id: "candidate-two",
                enabled: false,
                imagePath: "/fixtures/two.jpg",
                expected: { name: "Candidate Two" }
            },
            {
                id: "blocking-fixture",
                imagePath: "/fixtures/blocking.jpg",
                expected: { name: "Blocking Fixture" }
            },
            {
                id: "compound-fixture",
                enabled: false,
                imagePath: "/fixtures/compound.jpg",
                expected: { name: "Front // Back" }
            }
        ]
    };
}

describe("OCR training review stager", () => {
    it("writes unreviewed name-core pairs and a provenance report", async () => {
        const parent = await mkdtemp(path.join(os.tmpdir(), "mtg-training-review-"));
        const outputDirectory = path.join(parent, "batch-001");
        try {
            const preparedSources = [];
            const report = await stageTrainingReviewBatch(regressionManifest(), {
                caseIds: ["candidate-one", "candidate-two"],
                outputDirectory,
                rightsBasis: "Wizards Fan Content Policy; review-only local artifact",
                prepareOcrVariants: async (sourcePath) => {
                    preparedSources.push(sourcePath);
                    return {
                        variants: [
                            { region: "name-wide", buffer: Buffer.from("wide") },
                            { region: "name-core", buffer: Buffer.from(`core:${sourcePath}`) }
                        ]
                    };
                }
            });

            assert.deepEqual(preparedSources, ["/fixtures/one.jpg", "/fixtures/two.jpg"]);
            assert.equal(report.status, "unreviewed");
            assert.equal(report.samples.length, 2);
            assert.deepInclude(report.samples[0], {
                id: "candidate-one",
                transcription: "Candidate One",
                sourceCaseId: "candidate-one",
                region: "name-core",
                reviewed: false
            });
            assert.equal(
                await readFile(path.join(outputDirectory, "candidate-one.gt.txt"), "utf8"),
                "Candidate One"
            );
            assert.equal(
                await readFile(path.join(outputDirectory, "candidate-one.png"), "utf8"),
                "core:/fixtures/one.jpg"
            );
            const writtenReport = JSON.parse(
                await readFile(path.join(outputDirectory, "review-manifest.json"), "utf8")
            );
            assert.equal(writtenReport.samples[1].sourceCaseId, "candidate-two");
            assert.match(writtenReport.samples[0].imageSha256, /^[a-f0-9]{64}$/);
            assert.match(writtenReport.samples[0].transcriptionSha256, /^[a-f0-9]{64}$/);
        } finally {
            await rm(parent, { recursive: true, force: true });
        }
    });

    it("rejects enabled regression fixtures to prevent evaluation leakage", async () => {
        const outputDirectory = path.join(os.tmpdir(), "must-not-be-created");

        await rejects(
            stageTrainingReviewBatch(regressionManifest(), {
                caseIds: ["blocking-fixture"],
                outputDirectory,
                rightsBasis: "review-only",
                prepareOcrVariants: async () => ({ variants: [] })
            }),
            /blocking-fixture is enabled in the regression gate/
        );
    });

    it("rejects compound labels until face-specific ground truth is supplied", async () => {
        await rejects(
            stageTrainingReviewBatch(regressionManifest(), {
                caseIds: ["compound-fixture"],
                outputDirectory: path.join(os.tmpdir(), "must-not-be-created"),
                rightsBasis: "review-only",
                prepareOcrVariants: async () => ({ variants: [] })
            }),
            /compound-fixture uses a compound card name/
        );
    });
});
