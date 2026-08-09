import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rejects } from "node:assert/strict";
import { assert } from "chai";
import {
    MAX_REVIEW_BATCH_CASES,
    selectCases,
    stageTrainingReviewBatch
} from "../../src/training/training-review-stager.mjs";

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
            const reviewSheet = await readFile(path.join(outputDirectory, "review.md"), "utf8");
            assert.include(reviewSheet, "# OCR training review batch");
            assert.include(reviewSheet, "## Candidate One");
            assert.include(reviewSheet, "![Candidate One](./candidate-one.png)");
            assert.include(reviewSheet, "- [ ] Crop contains the complete exact transcription");
            assert.include(reviewSheet, "- Decision: `approve` / `reject`");
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

    it("rejects malformed, unsafe, duplicate, unknown, and placeholder selections", () => {
        const manifest = regressionManifest();
        const unsafeFixture = {
            id: "../unsafe",
            enabled: false,
            imagePath: "/fixtures/unsafe.jpg",
            expected: { name: "Unsafe" }
        };
        const placeholderFixture = {
            id: "placeholder",
            enabled: false,
            imagePath: "/fixtures/placeholder.jpg",
            expected: { name: "CHANGE_ME" }
        };
        const missingNameFixture = {
            id: "missing-name",
            enabled: false,
            imagePath: "/fixtures/missing-name.jpg",
            expected: {}
        };

        assert.throws(() => selectCases(null, ["candidate-one"]), "loaded regression manifest");
        assert.throws(() => selectCases(manifest, []), "At least one training review case");
        assert.throws(
            () => selectCases(manifest, Array(MAX_REVIEW_BATCH_CASES + 1).fill("candidate-one")),
            `limited to ${MAX_REVIEW_BATCH_CASES}`
        );
        assert.throws(
            () => selectCases(manifest, ["candidate-one", "candidate-one"]),
            "case IDs must be unique"
        );
        assert.throws(() => selectCases(manifest, ["unknown"]), "Unknown regression fixture");
        assert.throws(
            () =>
                selectCases({ ...manifest, cases: [...manifest.cases, unsafeFixture] }, [
                    "../unsafe"
                ]),
            "not safe to use as a training review filename"
        );
        assert.throws(
            () =>
                selectCases({ ...manifest, cases: [...manifest.cases, placeholderFixture] }, [
                    "placeholder"
                ]),
            "still has placeholder ground truth"
        );
        assert.throws(
            () =>
                selectCases({ ...manifest, cases: [...manifest.cases, missingNameFixture] }, [
                    "missing-name"
                ]),
            "expected name must be a non-empty string"
        );
    });

    it("removes a partial review directory when crop generation fails", async () => {
        const parent = await mkdtemp(path.join(os.tmpdir(), "mtg-training-review-"));
        const outputDirectory = path.join(parent, "failed-batch");
        try {
            await rejects(
                stageTrainingReviewBatch(regressionManifest(), {
                    caseIds: ["candidate-one"],
                    outputDirectory,
                    rightsBasis: "review-only",
                    prepareOcrVariants: async () => ({ variants: [] })
                }),
                /did not produce a non-empty name-core crop/
            );
            await rejects(access(outputDirectory), /ENOENT/);
        } finally {
            await rm(parent, { recursive: true, force: true });
        }
    });

    it("requires an output directory and rights/provenance basis", async () => {
        await rejects(
            stageTrainingReviewBatch(regressionManifest(), {
                caseIds: ["candidate-one"],
                outputDirectory: "",
                rightsBasis: "review-only"
            }),
            /outputDirectory must be a non-empty string/
        );
        await rejects(
            stageTrainingReviewBatch(regressionManifest(), {
                caseIds: ["candidate-one"],
                outputDirectory: "/tmp/not-created",
                rightsBasis: ""
            }),
            /rightsBasis must be a non-empty string/
        );
    });
});
