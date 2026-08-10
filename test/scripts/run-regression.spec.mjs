import { assert } from "chai";
import {
    buildProgram,
    defaultWorkers,
    main,
    parseWorkerCount
} from "../../scripts/run-regression.mjs";

describe("run-regression CLI::", () => {
    it("uses a bounded parallel worker default and accepts an explicit worker count", () => {
        const defaults = buildProgram().parse(["node", "run-regression.mjs"]).opts();
        const explicit = buildProgram()
            .parse(["node", "run-regression.mjs", "--workers", "3"])
            .opts();

        assert.equal(defaults.workers, defaultWorkers);
        assert.equal(explicit.workers, 3);
        assert.throws(() => parseWorkerCount("0"), "must be an integer from 1 to 3");
        assert.throws(() => parseWorkerCount("4"), "must be an integer from 1 to 3");
        assert.throws(() => parseWorkerCount("2.5"), "must be an integer from 1 to 3");
    });

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
            isolation: {
                ocrWorkerLifecycle:
                    "shared sequentially for at most 40 cases; adaptive state reset per crop"
            },
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
        assert.equal(receivedOptions.workers, defaultWorkers);
        assert.include(lines, "OCR model: official-eng-fast");
        assert.include(
            lines,
            "Tesseract worker: shared sequentially for at most 40 cases; adaptive state reset per crop"
        );
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
