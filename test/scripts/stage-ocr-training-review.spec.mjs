import { assert } from "chai";
import { buildProgram, main } from "../../scripts/stage-ocr-training-review.mjs";

describe("stage-ocr-training-review CLI::", () => {
    it("parses a bounded batch and repeated disabled fixture IDs", () => {
        const options = buildProgram()
            .parse([
                "node",
                "stage-ocr-training-review.mjs",
                "--batch",
                "batch-001",
                "--case",
                "candidate-one",
                "--case",
                "candidate-two",
                "--output-root",
                "/review"
            ])
            .opts();

        assert.equal(options.batch, "batch-001");
        assert.deepEqual(options.case, ["candidate-one", "candidate-two"]);
        assert.equal(options.outputRoot, "/review");
    });

    it("loads the regression manifest and stages the requested review batch", async () => {
        const regressionManifest = { path: "/fixtures/manifest.json" };
        const report = { status: "unreviewed", samples: [{ id: "candidate-one" }] };
        const lines = [];
        let stagingInput;

        const result = await main(
            [
                "node",
                "stage-ocr-training-review.mjs",
                "--batch",
                "batch-001",
                "--case",
                "candidate-one",
                "--manifest",
                "/fixtures/manifest.json",
                "--output-root",
                "/review"
            ],
            {
                loadManifest: async (manifestPath) => {
                    assert.equal(manifestPath, "/fixtures/manifest.json");
                    return regressionManifest;
                },
                stageTrainingReviewBatch: async (receivedManifest, options) => {
                    stagingInput = { receivedManifest, options };
                    return report;
                },
                writeLine: (line) => lines.push(line)
            }
        );

        assert.strictEqual(result, report);
        assert.strictEqual(stagingInput.receivedManifest, regressionManifest);
        assert.deepEqual(stagingInput.options.caseIds, ["candidate-one"]);
        assert.equal(stagingInput.options.outputDirectory, "/review/batch-001");
        assert.include(stagingInput.options.rightsBasis, "Wizards Fan Content Policy");
        assert.include(lines, "Training review batch: 1 unreviewed sample(s)");
        assert.include(lines, "Review directory: /review/batch-001");
    });
});
