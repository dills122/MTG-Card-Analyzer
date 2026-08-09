import { assert } from "chai";
import {
    compareOcrModelReports,
    formatOcrModelComparison
} from "../../src/regression/ocr-model-comparison.mjs";

function createReport({
    id,
    family,
    passed,
    blockingPassed,
    nonBlockingFailed,
    meanRuntimeMs,
    p95RuntimeMs,
    sizeBytes,
    results
}) {
    return {
        schemaVersion: 1,
        manifest: "/fixtures/manifest.json",
        ocrModel: { id, family, sizeBytes, sha256: id.padEnd(64, "0") },
        summary: {
            total: results.length,
            passed,
            failed: results.length - passed,
            passRate: (passed / results.length) * 100,
            meanRuntimeMs,
            p95RuntimeMs,
            totalRuntimeMs: meanRuntimeMs * results.length
        },
        gate: {
            total: results.filter((result) => result.blocking).length,
            passed: blockingPassed,
            failed: results.filter((result) => result.blocking).length - blockingPassed,
            nonBlocking: results.filter((result) => !result.blocking).length,
            nonBlockingFailed
        },
        results
    };
}

const fixture = (id, { passed, blocking = true, text, confidence = 80, failures = [] }) => ({
    id,
    blocking,
    expected: { name: id },
    ocr: { cleanText: text, confidence },
    runtimeMs: 100,
    passed,
    failures
});

describe("OCR model comparison", () => {
    it("reports candidate metric deltas, improvements, and blocking regressions", () => {
        const control = createReport({
            id: "control",
            family: "bundled",
            passed: 2,
            blockingPassed: 1,
            nonBlockingFailed: 1,
            meanRuntimeMs: 100,
            p95RuntimeMs: 140,
            sizeBytes: 20,
            results: [
                fixture("stable", { passed: true, text: "STABLE" }),
                fixture("improved", { passed: false, blocking: false, text: "WRONG" }),
                fixture("regressed", { passed: true, text: "REGRESSED" })
            ]
        });
        const candidate = createReport({
            id: "candidate",
            family: "best",
            passed: 2,
            blockingPassed: 1,
            nonBlockingFailed: 0,
            meanRuntimeMs: 125,
            p95RuntimeMs: 180,
            sizeBytes: 15,
            results: [
                fixture("stable", { passed: true, text: "STABLE" }),
                fixture("improved", {
                    passed: true,
                    blocking: false,
                    text: "IMPROVED",
                    confidence: 90
                }),
                fixture("regressed", {
                    passed: false,
                    text: "BROKEN",
                    confidence: 40,
                    failures: ["name mismatch"]
                })
            ]
        });

        const comparison = compareOcrModelReports(control, [candidate]);
        const result = comparison.candidates[0];

        assert.equal(result.model.id, "candidate");
        assert.equal(result.metrics.passedDelta, 0);
        assert.equal(result.metrics.meanRuntimeMsDelta, 25);
        assert.equal(result.metrics.p95RuntimeMsDelta, 40);
        assert.equal(result.metrics.sizeBytesDelta, -5);
        assert.deepEqual(
            result.changes.improvements.map((change) => change.id),
            ["improved"]
        );
        assert.deepEqual(
            result.changes.regressions.map((change) => change.id),
            ["regressed"]
        );
        assert.deepEqual(
            result.changes.blockingRegressions.map((change) => change.id),
            ["regressed"]
        );
        assert.isFalse(result.gatePassed);
    });

    it("rejects comparisons that do not use the same fixture IDs", () => {
        const control = createReport({
            id: "control",
            family: "bundled",
            passed: 1,
            blockingPassed: 1,
            nonBlockingFailed: 0,
            meanRuntimeMs: 100,
            p95RuntimeMs: 100,
            sizeBytes: 20,
            results: [fixture("one", { passed: true, text: "ONE" })]
        });
        const candidate = createReport({
            id: "candidate",
            family: "best",
            passed: 1,
            blockingPassed: 1,
            nonBlockingFailed: 0,
            meanRuntimeMs: 100,
            p95RuntimeMs: 100,
            sizeBytes: 15,
            results: [fixture("different", { passed: true, text: "DIFFERENT" })]
        });

        assert.throws(
            () => compareOcrModelReports(control, [candidate]),
            "candidate fixture IDs do not match control"
        );
    });

    it("formats a compact Markdown decision report", () => {
        const control = createReport({
            id: "control",
            family: "bundled",
            passed: 1,
            blockingPassed: 1,
            nonBlockingFailed: 0,
            meanRuntimeMs: 100,
            p95RuntimeMs: 100,
            sizeBytes: 20,
            results: [fixture("fixture", { passed: true, text: "FIXTURE" })]
        });
        const candidate = createReport({
            id: "candidate",
            family: "best",
            passed: 0,
            blockingPassed: 0,
            nonBlockingFailed: 0,
            meanRuntimeMs: 120,
            p95RuntimeMs: 120,
            sizeBytes: 15,
            results: [fixture("fixture", { passed: false, text: "BROKEN", failures: ["no match"] })]
        });

        const markdown = formatOcrModelComparison(compareOcrModelReports(control, [candidate]));

        assert.include(markdown, "# OCR model regression comparison");
        assert.include(markdown, "| candidate | best | 0/1 | 0/1 | FAIL | 120 ms (+20 ms)");
        assert.include(markdown, "## candidate fixture changes");
        assert.include(
            markdown,
            "| fixture | blocking | regression | FIXTURE | BROKEN | no match |"
        );
    });
});
