#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import { loadOcrModelManifest } from "../src/regression/ocr-model-candidate.mjs";
import { QUALITY_LEVELS, loadManifest } from "../src/regression/manifest.mjs";
import { runRegression } from "../src/regression/regression-runner.mjs";
import { writeBenchmarkReport } from "../src/regression/report.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultManifest = path.join(repositoryRoot, "test/regression/fixtures/manifest.json");
const defaultOutput = path.join(repositoryRoot, "artifacts/regression");
const defaultOcrModelManifest = path.join(
    repositoryRoot,
    "test/regression/ocr-models/manifest.json"
);
const defaultOcrModel = "bundled-eng-control";
const defaultWorkers = 3;

function collect(value, previous) {
    return previous.concat(value);
}

function parseWorkerCount(value) {
    if (!/^[1-3]$/.test(value)) {
        throw new InvalidArgumentError("must be an integer from 1 to 3");
    }
    return Number(value);
}

function buildProgram() {
    return new Command()
        .name("mtg-regression")
        .description("Run deterministic OCR and card-matching regression fixtures")
        .option("-m, --manifest <path>", "fixture manifest", defaultManifest)
        .option("-o, --output <directory>", "benchmark report directory", defaultOutput)
        .option(
            "--ocr-model-manifest <path>",
            "reviewed OCR model candidate manifest",
            defaultOcrModelManifest
        )
        .option("--ocr-model <id>", "OCR model candidate ID", defaultOcrModel)
        .option(
            "-w, --workers <count>",
            "parallel OCR worker sessions (1-3)",
            parseWorkerCount,
            defaultWorkers
        )
        .option("-c, --case <id>", "run a fixture id (repeatable)", collect, [])
        .option(
            "-q, --quality <level>",
            `run a quality level (repeatable: ${QUALITY_LEVELS.join(", ")})`,
            collect,
            []
        )
        .option("--no-fail-on-regression", "write the report but exit zero when fixtures fail");
}

async function main(argv = process.argv, overrides = {}) {
    const {
        loadManifest: loadFixtureManifest = loadManifest,
        loadOcrModelManifest: loadModelManifest = loadOcrModelManifest,
        runRegression: runRegressionFn = runRegression,
        writeBenchmarkReport: writeBenchmarkReportFn = writeBenchmarkReport,
        writeLine = console.log
    } = overrides;
    const options = buildProgram().parse(argv).opts();
    const unknownQualities = options.quality.filter((quality) => !QUALITY_LEVELS.includes(quality));
    if (unknownQualities.length > 0) {
        throw new Error(`Unknown quality level(s): ${unknownQualities.join(", ")}`);
    }

    const manifest = await loadFixtureManifest(options.manifest);
    const modelManifest = await loadModelManifest(options.ocrModelManifest);
    const ocrModel = modelManifest.candidates.find(
        (candidate) => candidate.id === options.ocrModel && candidate.enabled !== false
    );
    if (!ocrModel) {
        throw new Error(`Unknown OCR model candidate: ${options.ocrModel}`);
    }
    const report = await runRegressionFn(manifest, {
        caseIds: options.case,
        qualities: options.quality,
        ocrModel,
        workers: options.workers
    });
    const paths = await writeBenchmarkReportFn(report, options.output);
    writeLine(`OCR model: ${ocrModel.id}`);
    writeLine(
        `Regression: ${report.summary.passed}/${report.summary.total} passed (${report.summary.passRate}%)`
    );
    writeLine(
        `CI gate: ${report.gate.passed}/${report.gate.total} blocking fixtures passed; ${report.gate.nonBlockingFailed}/${report.gate.nonBlocking} non-blocking fixtures failed`
    );
    writeLine("Application persistence, image-hash cache, and OCR cache: disabled");
    writeLine(`Tesseract worker: ${report.isolation.ocrWorkerLifecycle}`);
    writeLine(`Wall runtime: ${report.summary.wallRuntimeMs} ms`);
    if (report.pending.cases > 0) {
        writeLine(`Disabled fixtures: ${report.pending.cases}`);
    }
    if (report.pending.placeholderCases > 0) {
        writeLine(
            `Fixtures containing CHANGE_ME: ${report.pending.placeholderCases} (search the manifest to label them)`
        );
    }
    writeLine(`Markdown report: ${paths.markdownPath}`);
    writeLine(`JSON report: ${paths.jsonPath}`);

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

export { buildProgram, defaultWorkers, main, parseWorkerCount };
