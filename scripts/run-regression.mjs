#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import { QUALITY_LEVELS, loadManifest } from "../src/regression/manifest.mjs";
import { runRegression } from "../src/regression/regression-runner.mjs";
import { writeBenchmarkReport } from "../src/regression/report.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultManifest = path.join(repositoryRoot, "test/regression/fixtures/manifest.json");
const defaultOutput = path.join(repositoryRoot, "artifacts/regression");

function collect(value, previous) {
    return previous.concat(value);
}

function buildProgram() {
    return new Command()
        .name("mtg-regression")
        .description("Run deterministic OCR and card-matching regression fixtures")
        .option("-m, --manifest <path>", "fixture manifest", defaultManifest)
        .option("-o, --output <directory>", "benchmark report directory", defaultOutput)
        .option("-c, --case <id>", "run a fixture id (repeatable)", collect, [])
        .option(
            "-q, --quality <level>",
            `run a quality level (repeatable: ${QUALITY_LEVELS.join(", ")})`,
            collect,
            []
        )
        .option("--no-fail-on-regression", "write the report but exit zero when fixtures fail");
}

async function main(argv = process.argv) {
    const options = buildProgram().parse(argv).opts();
    const unknownQualities = options.quality.filter((quality) => !QUALITY_LEVELS.includes(quality));
    if (unknownQualities.length > 0) {
        throw new Error(`Unknown quality level(s): ${unknownQualities.join(", ")}`);
    }

    const manifest = await loadManifest(options.manifest);
    const report = await runRegression(manifest, {
        caseIds: options.case,
        qualities: options.quality
    });
    const paths = await writeBenchmarkReport(report, options.output);
    console.log(
        `Regression: ${report.summary.passed}/${report.summary.total} passed (${report.summary.passRate}%)`
    );
    console.log(
        `CI gate: ${report.gate.passed}/${report.gate.total} blocking fixtures passed; ${report.gate.nonBlockingFailed}/${report.gate.nonBlocking} non-blocking fixtures failed`
    );
    console.log("Application persistence, image-hash cache, and OCR cache: disabled");
    if (report.pending.cases > 0) {
        console.log(`Disabled fixtures: ${report.pending.cases}`);
    }
    if (report.pending.placeholderCases > 0) {
        console.log(
            `Fixtures containing CHANGE_ME: ${report.pending.placeholderCases} (search the manifest to label them)`
        );
    }
    console.log(`Markdown report: ${paths.markdownPath}`);
    console.log(`JSON report: ${paths.jsonPath}`);

    if (options.failOnRegression && report.gate.failed > 0) {
        process.exitCode = 1;
    }
    return report;
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((err) => {
        console.error(err?.stack || err);
        process.exitCode = 1;
    });
}

export { buildProgram, main };
