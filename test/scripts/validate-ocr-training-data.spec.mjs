import { assert } from "chai";
import { buildProgram, main } from "../../scripts/validate-ocr-training-data.mjs";

describe("validate-ocr-training-data CLI::", () => {
    it("parses an explicit manifest and readiness gate", () => {
        const options = buildProgram()
            .parse([
                "node",
                "validate-ocr-training-data.mjs",
                "--manifest",
                "/training/manifest.json",
                "--require-ready"
            ])
            .opts();

        assert.equal(options.manifest, "/training/manifest.json");
        assert.isTrue(options.requireReady);
    });

    it("verifies the manifest and reports deterministic split counts", async () => {
        const manifest = {
            status: "reviewed",
            modelName: "eng_mtg",
            baseModel: { id: "official-eng-best" },
            samples: [{ id: "one" }, { id: "two" }]
        };
        const lines = [];
        let readinessInput;

        const result = await main(
            [
                "node",
                "validate-ocr-training-data.mjs",
                "--manifest",
                "/training/manifest.json",
                "--require-ready"
            ],
            {
                loadTrainingDataManifest: async (manifestPath) => {
                    assert.equal(manifestPath, "/training/manifest.json");
                    return manifest;
                },
                assertTrainingDataReady: (receivedManifest) => {
                    readinessInput = receivedManifest;
                    return { total: 2, train: 1, evaluation: 1 };
                },
                writeLine: (line) => lines.push(line)
            }
        );

        assert.strictEqual(result, manifest);
        assert.strictEqual(readinessInput, manifest);
        assert.include(lines, "Training data: 2 verified sample(s); status reviewed");
        assert.include(lines, "Deterministic split: 1 train / 1 evaluation");
        assert.include(lines, "Base model: official-eng-best");
    });
});
