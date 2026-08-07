import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function markdownCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\|/g, "\\|")
        .trim();
}

function formatBenchmarkReport(report) {
    const lines = [
        "# MTG Card Analyzer regression benchmark",
        "",
        `Generated: ${report.generatedAt}`,
        "",
        `Manifest: \`${report.manifest}\``,
        "",
        `Mode: ${report.offline ? "offline (no live API calls)" : "online"}`,
        "",
        `Isolation: application persistence ${report.isolation?.applicationPersistence || "unknown"}; image-hash cache ${report.isolation?.imageHashCache || "unknown"}; OCR cache ${report.isolation?.ocrCache || "unknown"}`,
        "",
        "## Summary",
        "",
        `- Passed: ${report.summary.passed}/${report.summary.total} (${report.summary.passRate}%)`,
        `- Failed: ${report.summary.failed}`,
        `- CI gate: ${report.gate?.failed === 0 ? "PASS" : "FAIL"} (${report.gate?.passed || 0}/${report.gate?.total || 0} blocking fixtures passed)`,
        `- Non-blocking fixtures: ${report.gate?.nonBlocking || 0} (${report.gate?.nonBlockingFailed || 0} failed)`,
        `- Disabled fixtures: ${report.pending?.cases || 0}`,
        `- Fixtures containing CHANGE_ME: ${report.pending?.placeholderCases || 0}`,
        `- Total runtime: ${report.summary.totalRuntimeMs} ms`,
        `- Mean runtime: ${report.summary.meanRuntimeMs} ms`,
        `- P95 runtime: ${report.summary.p95RuntimeMs} ms`,
        "",
        "## Quality levels",
        "",
        "| Quality | Passed | Total |",
        "| --- | ---: | ---: |"
    ];

    Object.entries(report.summary.byQuality).forEach(([quality, summary]) => {
        lines.push(`| ${markdownCell(quality)} | ${summary.passed} | ${summary.total} |`);
    });

    lines.push(
        "",
        "## Fixture results",
        "",
        "| Fixture | Quality | OCR output | Name match | Name candidates | Print candidates | Set / collector | Print score | Set verified | Runtime | Result |",
        "| --- | --- | --- | --- | ---: | ---: | --- | ---: | --- | ---: | --- |"
    );

    report.results.forEach((result) => {
        const nameMatch = result.nameMatches[0];
        const selectedCard = result.selectedPrint?.card;
        const resultLabel = result.passed
            ? "PASS"
            : `${result.blocking === false ? "NON-BLOCKING FAIL" : "FAIL"}: ${result.failures
                  .map(markdownCell)
                  .join("; ")}`;
        lines.push(
            `| ${markdownCell(result.id)} | ${markdownCell(result.quality)} | ${markdownCell(
                result.ocr.cleanText
            )} | ${markdownCell(nameMatch?.name || "—")} (${
                nameMatch ? Math.round(nameMatch.percentage * 10000) / 100 : 0
            }%) | ${result.nameCandidateCount} | ${result.printCandidateCount} | ${markdownCell(
                selectedCard ? `${selectedCard.set} #${selectedCard.collectorNumber}` : "—"
            )} | ${result.selectedPrint ? Math.round(result.selectedPrint.score * 10000) / 100 : 0}% | ${result.setVerified ? "yes" : "no"} | ${result.runtimeMs} ms | ${resultLabel} |`
        );
    });

    lines.push("", "## Stage timings", "");
    report.results.forEach((result) => {
        lines.push(
            `- ${markdownCell(result.id)}: fixture ${result.timings.fixtureMs || 0} ms; OCR ${
                result.timings.ocrMs || 0
            } ms; name matching ${result.timings.nameMatchMs || 0} ms; print matching ${
                result.timings.printMatchMs || 0
            } ms.`
        );
    });

    return `${lines.join("\n")}\n`;
}

async function writeBenchmarkReport(report, outputDirectory) {
    const absoluteOutput = path.resolve(outputDirectory);
    await mkdir(absoluteOutput, { recursive: true });
    const jsonPath = path.join(absoluteOutput, "benchmark.json");
    const markdownPath = path.join(absoluteOutput, "benchmark.md");
    await Promise.all([
        writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
        writeFile(markdownPath, formatBenchmarkReport(report), "utf8")
    ]);
    return { jsonPath, markdownPath };
}

export { formatBenchmarkReport, markdownCell, writeBenchmarkReport };

export default {
    formatBenchmarkReport,
    markdownCell,
    writeBenchmarkReport
};
