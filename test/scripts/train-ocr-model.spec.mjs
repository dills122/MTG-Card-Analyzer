import { rejects } from "node:assert/strict";
import { assert } from "chai";
import { buildProgram, main } from "../../scripts/train-ocr-model.mjs";

const manifest = {
    path: "/repo/training/ocr/manifest.json",
    directory: "/repo/training/ocr",
    status: "reviewed",
    modelName: "eng_mtg",
    randomSeed: 20260808,
    trainRatio: 0.9,
    baseModel: {
        id: "official-eng-best",
        sha256: "8".repeat(64),
        source: { revision: "base-revision" }
    },
    samples: [{ id: "one" }, { id: "two" }]
};

function dependencies(overrides = {}) {
    const calls = [];
    return {
        calls,
        values: {
            repositoryRoot: "/repo",
            loadTrainingDataManifest: async () => manifest,
            assertTrainingDataReady: () => ({ total: 2, train: 1, evaluation: 1 }),
            createOcrTrainingPlan: (_manifest, options) => ({
                runDirectory: options.runDirectory,
                finalModelPath: `${options.runDirectory}/data/eng_mtg.traineddata`,
                command: { executable: "docker", args: ["run", "training-image"] },
                provenance: { maxIterations: options.maxIterations }
            }),
            createOcrTrainingImageBuildPlan: () => ({
                executable: "docker",
                args: ["build", "training-image"]
            }),
            prepareOcrTrainingRun: async () => calls.push("prepare"),
            packageOcrTrainingCandidate: async (_manifest, _plan, options) => {
                calls.push(["package", options]);
                return {
                    candidateId: options.candidateId,
                    manifestPath: "/run/candidate/manifest.json"
                };
            },
            runCommand: async (executable, args) => calls.push(["command", executable, args]),
            getSourceRevision: async () => "git-head",
            writeLine: (line) => calls.push(["line", line]),
            ...overrides
        }
    };
}

describe("train-ocr-model CLI", () => {
    it("parses bounded training and image-build options", () => {
        const options = buildProgram("/repo")
            .parse([
                "node",
                "train-ocr-model.mjs",
                "--run",
                "run-001",
                "--max-iterations",
                "1500",
                "--cpus",
                "3",
                "--memory-gb",
                "6",
                "--build-image",
                "--dry-run"
            ])
            .opts();

        assert.deepInclude(options, {
            run: "run-001",
            maxIterations: 1500,
            cpus: 3,
            memoryGb: 6,
            buildImage: true,
            dryRun: true
        });
    });

    it("validates readiness and prints a dry run without creating artifacts", async () => {
        const { calls, values } = dependencies();

        const result = await main(
            ["node", "train-ocr-model.mjs", "--run", "run-001", "--dry-run"],
            values
        );

        assert.equal(result.plan.runDirectory, "/repo/artifacts/training-runs/run-001");
        assert.deepEqual(result.readiness, { total: 2, train: 1, evaluation: 1 });
        assert.notInclude(calls, "prepare");
        assert.isTrue(
            calls.some(
                ([kind, line]) => kind === "line" && line.includes("docker run training-image")
            )
        );
    });

    it("builds, trains, and packages a candidate in that order", async () => {
        const { calls, values } = dependencies();

        const result = await main(
            [
                "node",
                "train-ocr-model.mjs",
                "--run",
                "run-002",
                "--build-image",
                "--max-iterations",
                "500"
            ],
            values
        );

        assert.deepEqual(calls.slice(0, 4), [
            ["command", "docker", ["build", "training-image"]],
            "prepare",
            ["command", "docker", ["run", "training-image"]],
            ["package", { candidateId: "eng_mtg-run-002", sourceRevision: "git-head" }]
        ]);
        assert.equal(result.candidate.candidateId, "eng_mtg-run-002");
    });

    it("preserves prepared diagnostics and skips packaging when training fails", async () => {
        const { calls, values } = dependencies({
            runCommand: async (_executable, args) => {
                if (args[0] === "run") {
                    throw new Error("container failed");
                }
                calls.push(["command", "docker", args]);
            }
        });

        await rejects(
            main(["node", "train-ocr-model.mjs", "--run", "run-003"], values),
            /Training failed; preserved run artifacts.*container failed/
        );
        assert.include(calls, "prepare");
        assert.isFalse(calls.some((entry) => Array.isArray(entry) && entry[0] === "package"));
    });

    it("rejects unsafe run identifiers before loading the corpus", async () => {
        const { values } = dependencies({
            loadTrainingDataManifest: async () => {
                throw new Error("manifest should not load");
            }
        });

        await rejects(
            main(["node", "train-ocr-model.mjs", "--run", "../escape"], values),
            /Run ID must use lowercase/
        );
    });
});
