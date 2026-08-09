import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function round(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function signed(value, suffix = "") {
    const rounded = round(value);
    return `${rounded >= 0 ? "+" : ""}${rounded}${suffix}`;
}

function markdownCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\|/g, "\\|")
        .trim();
}

function validateReport(report, label) {
    if (!report || typeof report !== "object") {
        throw new Error(`${label} report must be an object`);
    }
    if (!report.ocrModel?.id) {
        throw new Error(`${label} report does not identify its OCR model`);
    }
    if (!report.summary || !report.gate || !Array.isArray(report.results)) {
        throw new Error(`${label} report is missing summary, gate, or fixture results`);
    }

    const ids = report.results.map((result) => result.id);
    if (ids.some((id) => typeof id !== "string" || id.length === 0)) {
        throw new Error(`${label} report contains a fixture without an ID`);
    }
    if (new Set(ids).size !== ids.length) {
        throw new Error(`${label} report contains duplicate fixture IDs`);
    }
}

function assertSameFixtureSet(control, candidate) {
    const controlIds = control.results.map((result) => result.id).sort();
    const candidateIds = candidate.results.map((result) => result.id).sort();
    if (
        controlIds.length !== candidateIds.length ||
        controlIds.some((id, index) => id !== candidateIds[index])
    ) {
        throw new Error(`${candidate.ocrModel.id} fixture IDs do not match control`);
    }
}

function summarizeChange(controlResult, candidateResult, kind) {
    return {
        id: candidateResult.id,
        blocking: candidateResult.blocking !== false,
        kind,
        expectedName: candidateResult.expected?.name,
        controlOcr: controlResult.ocr?.cleanText,
        candidateOcr: candidateResult.ocr?.cleanText,
        controlConfidence: controlResult.ocr?.confidence,
        candidateConfidence: candidateResult.ocr?.confidence,
        failures: candidateResult.failures || []
    };
}

function compareCandidate(control, candidate) {
    assertSameFixtureSet(control, candidate);
    const controlById = new Map(control.results.map((result) => [result.id, result]));
    const improvements = [];
    const regressions = [];

    candidate.results.forEach((candidateResult) => {
        const controlResult = controlById.get(candidateResult.id);
        if (controlResult.passed === candidateResult.passed) {
            return;
        }
        const kind = candidateResult.passed ? "improvement" : "regression";
        const change = summarizeChange(controlResult, candidateResult, kind);
        (candidateResult.passed ? improvements : regressions).push(change);
    });

    return {
        model: candidate.ocrModel,
        metrics: {
            passed: candidate.summary.passed,
            total: candidate.summary.total,
            passRate: candidate.summary.passRate,
            passedDelta: candidate.summary.passed - control.summary.passed,
            blockingPassed: candidate.gate.passed,
            blockingTotal: candidate.gate.total,
            blockingPassedDelta: candidate.gate.passed - control.gate.passed,
            nonBlockingFailed: candidate.gate.nonBlockingFailed,
            nonBlockingFailedDelta:
                candidate.gate.nonBlockingFailed - control.gate.nonBlockingFailed,
            meanRuntimeMs: candidate.summary.meanRuntimeMs,
            meanRuntimeMsDelta: round(
                candidate.summary.meanRuntimeMs - control.summary.meanRuntimeMs
            ),
            p95RuntimeMs: candidate.summary.p95RuntimeMs,
            p95RuntimeMsDelta: round(candidate.summary.p95RuntimeMs - control.summary.p95RuntimeMs),
            totalRuntimeMs: candidate.summary.totalRuntimeMs,
            totalRuntimeMsDelta: round(
                candidate.summary.totalRuntimeMs - control.summary.totalRuntimeMs
            ),
            sizeBytes: candidate.ocrModel.sizeBytes,
            sizeBytesDelta: candidate.ocrModel.sizeBytes - control.ocrModel.sizeBytes
        },
        gatePassed: candidate.gate.failed === 0 && regressions.every((change) => !change.blocking),
        changes: {
            improvements,
            regressions,
            blockingRegressions: regressions.filter((change) => change.blocking)
        }
    };
}

function compareOcrModelReports(control, candidates) {
    validateReport(control, "control");
    if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error("At least one candidate report is required");
    }
    candidates.forEach((candidate) => validateReport(candidate, "candidate"));

    return {
        schemaVersion: 1,
        control: {
            model: control.ocrModel,
            metrics: {
                passed: control.summary.passed,
                total: control.summary.total,
                passRate: control.summary.passRate,
                blockingPassed: control.gate.passed,
                blockingTotal: control.gate.total,
                nonBlockingFailed: control.gate.nonBlockingFailed,
                meanRuntimeMs: control.summary.meanRuntimeMs,
                p95RuntimeMs: control.summary.p95RuntimeMs,
                totalRuntimeMs: control.summary.totalRuntimeMs,
                sizeBytes: control.ocrModel.sizeBytes
            }
        },
        candidates: candidates.map((candidate) => compareCandidate(control, candidate))
    };
}

function formatOcrModelComparison(comparison) {
    const control = comparison.control;
    const lines = [
        "# OCR model regression comparison",
        "",
        "| Model | Family | Accuracy | Blocking | Gate | Mean runtime | P95 runtime | Model size |",
        "| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |",
        `| ${markdownCell(control.model.id)} | ${markdownCell(control.model.family)} | ${
            control.metrics.passed
        }/${control.metrics.total} | ${control.metrics.blockingPassed}/${
            control.metrics.blockingTotal
        } | CONTROL | ${control.metrics.meanRuntimeMs} ms | ${
            control.metrics.p95RuntimeMs
        } ms | ${control.metrics.sizeBytes} B |`
    ];

    comparison.candidates.forEach((candidate) => {
        const metrics = candidate.metrics;
        lines.push(
            `| ${markdownCell(candidate.model.id)} | ${markdownCell(candidate.model.family)} | ${
                metrics.passed
            }/${metrics.total} | ${metrics.blockingPassed}/${metrics.blockingTotal} | ${
                candidate.gatePassed ? "PASS" : "FAIL"
            } | ${metrics.meanRuntimeMs} ms (${signed(
                metrics.meanRuntimeMsDelta,
                " ms"
            )}) | ${metrics.p95RuntimeMs} ms (${signed(
                metrics.p95RuntimeMsDelta,
                " ms"
            )}) | ${metrics.sizeBytes} B (${signed(metrics.sizeBytesDelta, " B")}) |`
        );
    });

    comparison.candidates.forEach((candidate) => {
        lines.push(
            "",
            `## ${markdownCell(candidate.model.id)} fixture changes`,
            "",
            `- Net passes: ${signed(candidate.metrics.passedDelta)}`,
            `- Blocking passes: ${signed(candidate.metrics.blockingPassedDelta)}`,
            `- Non-blocking failures: ${signed(candidate.metrics.nonBlockingFailedDelta)}`,
            "",
            "| Fixture | Scope | Change | Control OCR | Candidate OCR | Candidate failure |",
            "| --- | --- | --- | --- | --- | --- |"
        );

        const changes = [...candidate.changes.improvements, ...candidate.changes.regressions];
        if (changes.length === 0) {
            lines.push("| — | — | no pass/fail changes | — | — | — |");
        } else {
            changes.forEach((change) => {
                lines.push(
                    `| ${markdownCell(change.id)} | ${
                        change.blocking ? "blocking" : "non-blocking"
                    } | ${change.kind} | ${markdownCell(change.controlOcr)} | ${markdownCell(
                        change.candidateOcr
                    )} | ${markdownCell(change.failures.join("; ") || "—")} |`
                );
            });
        }
    });

    return `${lines.join("\n")}\n`;
}

async function writeOcrModelComparison(comparison, outputDirectory) {
    const absoluteOutput = path.resolve(outputDirectory);
    await mkdir(absoluteOutput, { recursive: true });
    const jsonPath = path.join(absoluteOutput, "comparison.json");
    const markdownPath = path.join(absoluteOutput, "comparison.md");
    await Promise.all([
        writeFile(jsonPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8"),
        writeFile(markdownPath, formatOcrModelComparison(comparison), "utf8")
    ]);
    return { jsonPath, markdownPath };
}

export { compareOcrModelReports, formatOcrModelComparison, writeOcrModelComparison };
