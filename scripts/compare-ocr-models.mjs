#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import {
    compareOcrModelReports,
    writeOcrModelComparison
} from "../src/regression/ocr-model-comparison.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultOutput = path.join(repositoryRoot, "artifacts/regression/model-comparison");

function collect(value, previous) {
    return previous.concat(value);
}

function buildProgram() {
    return new Command()
        .name("compare-ocr-models")
        .description("Compare like-for-like OCR model regression benchmark reports")
        .requiredOption("--control <path>", "control benchmark.json report")
        .option("--candidate <path>", "candidate benchmark.json report (repeatable)", collect, [])
        .option("-o, --output <directory>", "comparison report directory", defaultOutput);
}

async function readReport(reportPath) {
    const absolutePath = path.resolve(reportPath);
    try {
        return JSON.parse(await readFile(absolutePath, "utf8"));
    } catch (error) {
        throw new Error(`Unable to read benchmark report ${absolutePath}: ${error.message}`, {
            cause: error
        });
    }
}

async function main(argv = process.argv, overrides = {}) {
    const {
        readReport: readReportFn = readReport,
        compareOcrModelReports: compareReportsFn = compareOcrModelReports,
        writeOcrModelComparison: writeComparisonFn = writeOcrModelComparison,
        writeLine = console.log
    } = overrides;
    const options = buildProgram().parse(argv).opts();
    if (options.candidate.length === 0) {
        throw new Error("At least one --candidate report is required");
    }

    const [control, ...candidates] = await Promise.all(
        [options.control, ...options.candidate].map((reportPath) => readReportFn(reportPath))
    );
    const comparison = compareReportsFn(control, candidates);
    const paths = await writeComparisonFn(comparison, options.output);
    writeLine(`Markdown: ${paths.markdownPath}`);
    writeLine(`JSON: ${paths.jsonPath}`);
    return comparison;
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}

export { buildProgram, main, readReport };
