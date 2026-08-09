import { assert } from "chai";
import { buildProgram, main } from "../../scripts/run-regression.mjs";

describe("run-regression CLI::", () => {
    it("parses an explicit OCR candidate manifest and candidate ID", () => {
        const options = buildProgram()
            .parse([
                "node",
                "run-regression.mjs",
                "--ocr-model-manifest",
                "/fixtures/models.json",
                "--ocr-model",
                "official-eng-fast"
            ])
            .opts();

        assert.equal(options.ocrModelManifest, "/fixtures/models.json");
        assert.equal(options.ocrModel, "official-eng-fast");
    });

    it("runs the regression with the selected, verified OCR candidate", async () => {
        const selectedCandidate = {
            id: "official-eng-fast",
            languagePath: "/fixtures/fast",
            sha256: "b".repeat(64)
        };
        let receivedOptions;
        const lines = [];
        const report = {
            summary: { passed: 1, total: 1, passRate: 100 },
            gate: { passed: 1, total: 1, failed: 0, nonBlocking: 0, nonBlockingFailed: 0 },
            pending: { cases: 0, placeholderCases: 0 }
        };

        const result = await main(
            [
                "node",
                "run-regression.mjs",
                "--ocr-model-manifest",
                "/fixtures/models.json",
                "--ocr-model",
                "official-eng-fast"
            ],
            {
                loadManifest: async () => ({ path: "/fixtures/regression.json" }),
                loadOcrModelManifest: async () => ({ candidates: [selectedCandidate] }),
                runRegression: async (_manifest, options) => {
                    receivedOptions = options;
                    return report;
                },
                writeBenchmarkReport: async () => ({
                    markdownPath: "/reports/benchmark.md",
                    jsonPath: "/reports/benchmark.json"
                }),
                writeLine: (line) => lines.push(line)
            }
        );

        assert.strictEqual(result, report);
        assert.strictEqual(receivedOptions.ocrModel, selectedCandidate);
        assert.include(lines, "OCR model: official-eng-fast");
    });

    it("rejects an OCR candidate ID that is not in the verified manifest", async () => {
        let error;
        try {
            await main(["node", "run-regression.mjs", "--ocr-model", "missing-model"], {
                loadManifest: async () => ({ path: "/fixtures/regression.json" }),
                loadOcrModelManifest: async () => ({
                    candidates: [{ id: "missing-model", enabled: false }]
                }),
                runRegression: async () => {
                    throw new Error("disabled candidate must not run");
                }
            });
        } catch (caught) {
            error = caught;
        }

        assert.instanceOf(error, Error);
        assert.include(error.message, "Unknown OCR model candidate: missing-model");
    });
});
