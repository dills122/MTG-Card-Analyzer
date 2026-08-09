import { assert } from "chai";
import { buildProgram, main } from "../../scripts/compare-ocr-models.mjs";

describe("compare-ocr-models CLI::", () => {
    it("parses one control and repeated candidate report paths", () => {
        const options = buildProgram()
            .parse([
                "node",
                "compare-ocr-models.mjs",
                "--control",
                "/reports/control.json",
                "--candidate",
                "/reports/fast.json",
                "--candidate",
                "/reports/best.json",
                "--output",
                "/reports/comparison"
            ])
            .opts();

        assert.equal(options.control, "/reports/control.json");
        assert.deepEqual(options.candidate, ["/reports/fast.json", "/reports/best.json"]);
        assert.equal(options.output, "/reports/comparison");
    });

    it("loads, compares, and writes the selected reports", async () => {
        const loadedPaths = [];
        const written = [];
        const lines = [];
        const control = { ocrModel: { id: "control" } };
        const candidate = { ocrModel: { id: "best" } };
        const comparison = { schemaVersion: 1 };

        const result = await main(
            [
                "node",
                "compare-ocr-models.mjs",
                "--control",
                "/reports/control.json",
                "--candidate",
                "/reports/best.json",
                "--output",
                "/reports/comparison"
            ],
            {
                readReport: async (reportPath) => {
                    loadedPaths.push(reportPath);
                    return reportPath.includes("control") ? control : candidate;
                },
                compareOcrModelReports: (receivedControl, receivedCandidates) => {
                    assert.strictEqual(receivedControl, control);
                    assert.deepEqual(receivedCandidates, [candidate]);
                    return comparison;
                },
                writeOcrModelComparison: async (receivedComparison, outputDirectory) => {
                    written.push({ receivedComparison, outputDirectory });
                    return {
                        markdownPath: "/reports/comparison/comparison.md",
                        jsonPath: "/reports/comparison/comparison.json"
                    };
                },
                writeLine: (line) => lines.push(line)
            }
        );

        assert.strictEqual(result, comparison);
        assert.deepEqual(loadedPaths, ["/reports/control.json", "/reports/best.json"]);
        assert.deepEqual(written, [
            { receivedComparison: comparison, outputDirectory: "/reports/comparison" }
        ]);
        assert.include(lines, "Markdown: /reports/comparison/comparison.md");
        assert.include(lines, "JSON: /reports/comparison/comparison.json");
    });
});
