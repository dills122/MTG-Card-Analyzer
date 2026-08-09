import { assert } from "chai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    LANGDATA_LSTM_REVISION,
    OCR_TRAINING_IMAGE,
    TESSTRAIN_REVISION,
    createOcrTrainingImageBuildPlan,
    createOcrTrainingPlan
} from "../../src/training/ocr-training-plan.mjs";

function reviewedManifest() {
    return {
        path: "/repo/training/ocr/manifest.json",
        directory: "/repo/training/ocr",
        status: "reviewed",
        modelName: "eng_mtg",
        randomSeed: 20260808,
        trainRatio: 0.9,
        baseModel: {
            id: "official-eng-best",
            family: "tessdata_best",
            sha256: "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba",
            source: {
                revision: "e12c65a915945e4c28e237a9b52bc4a8f39a0cec"
            }
        },
        samples: [
            {
                id: "one",
                imagePath: "/repo/training/ocr/ground-truth/one.png",
                imageSha256: "1".repeat(64),
                transcriptionSha256: "2".repeat(64)
            },
            {
                id: "two",
                imagePath: "/repo/training/ocr/ground-truth/two.png",
                imageSha256: "3".repeat(64),
                transcriptionSha256: "4".repeat(64)
            }
        ]
    };
}

describe("OCR training plan", () => {
    it("pins every downloaded Docker training input", async () => {
        const testDirectory = path.dirname(fileURLToPath(import.meta.url));
        const dockerfile = await readFile(
            path.resolve(testDirectory, "../../training/ocr/Dockerfile"),
            "utf8"
        );

        assert.include(
            dockerfile,
            "ubuntu:24.04@sha256:561618e2c15bf2397621dd04f96926663a3b5616c189cf7e38db7e82f5c538ea"
        );
        assert.include(dockerfile, TESSTRAIN_REVISION);
        assert.include(dockerfile, LANGDATA_LSTM_REVISION);
        assert.include(
            dockerfile,
            "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba"
        );
    });

    it("builds a bounded offline tesstrain command from reviewed manifest settings", () => {
        const plan = createOcrTrainingPlan(reviewedManifest(), {
            runDirectory: "/repo/artifacts/training-runs/run-001",
            maxIterations: 1500,
            cpus: 3,
            memoryGb: 4,
            uid: 501,
            gid: 20
        });

        assert.equal(TESSTRAIN_REVISION, "405346a3a67d8e4e049341d1da6a4b752e0b8351");
        assert.equal(plan.image, OCR_TRAINING_IMAGE);
        assert.equal(
            plan.finalModelPath,
            "/repo/artifacts/training-runs/run-001/data/eng_mtg.traineddata"
        );
        assert.deepEqual(plan.command, {
            executable: "docker",
            args: [
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
                "3",
                "--memory",
                "4g",
                "--pids-limit",
                "512",
                "--user",
                "501:20",
                "--env",
                "HOME=/tmp",
                "--tmpfs",
                "/tmp:rw,noexec,nosuid,size=1g",
                "--mount",
                "type=bind,src=/repo/artifacts/training-runs/run-001,dst=/run",
                OCR_TRAINING_IMAGE,
                "training",
                "MODEL_NAME=eng_mtg",
                "START_MODEL=eng",
                "TESSDATA=/opt/tessdata_best",
                "LANGDATA_DIR=/opt/langdata_lstm",
                "DATA_DIR=/run/data",
                "OUTPUT_DIR=/run/data/eng_mtg",
                "GROUND_TRUTH_DIR=/run/ground-truth",
                "MAX_ITERATIONS=1500",
                "RANDOM_SEED=20260808",
                "RATIO_TRAIN=0.9",
                "PSM=13"
            ]
        });
        assert.deepInclude(plan.provenance, {
            tesstrainRevision: TESSTRAIN_REVISION,
            langdataLstmRevision: LANGDATA_LSTM_REVISION,
            baseModelRevision: "e12c65a915945e4c28e237a9b52bc4a8f39a0cec",
            baseModelSha256: "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba",
            maxIterations: 1500,
            psm: 13,
            randomSeed: 20260808,
            trainRatio: 0.9
        });
        assert.deepEqual(plan.provenance.samples, [
            {
                id: "one",
                imageSha256: "1".repeat(64),
                transcriptionSha256: "2".repeat(64)
            },
            {
                id: "two",
                imageSha256: "3".repeat(64),
                transcriptionSha256: "4".repeat(64)
            }
        ]);
    });

    it("builds the pinned local training image from the repository Dockerfile", () => {
        const build = createOcrTrainingImageBuildPlan("/repo");

        assert.deepEqual(build, {
            executable: "docker",
            args: [
                "build",
                "--file",
                "/repo/training/ocr/Dockerfile",
                "--tag",
                OCR_TRAINING_IMAGE,
                "/repo/training/ocr"
            ]
        });
    });

    it("rejects unsafe paths and unbounded resource settings", () => {
        const manifest = reviewedManifest();
        const cases = [
            [{ runDirectory: "/repo/run,escape" }, "must not contain commas"],
            [{ runDirectory: "/" }, "runDirectory must not be a filesystem root"],
            [{ runDirectory: "/repo/run", maxIterations: 0 }, "maxIterations must be"],
            [{ runDirectory: "/repo/run", maxIterations: 100001 }, "maxIterations must be"],
            [{ runDirectory: "/repo/run", cpus: 0 }, "cpus must be"],
            [{ runDirectory: "/repo/run", cpus: 17 }, "cpus must be"],
            [{ runDirectory: "/repo/run", memoryGb: 0 }, "memoryGb must be"],
            [{ runDirectory: "/repo/run", memoryGb: 17 }, "memoryGb must be"]
        ];

        for (const [options, message] of cases) {
            assert.throws(() => createOcrTrainingPlan(manifest, options), message);
        }
    });
});
