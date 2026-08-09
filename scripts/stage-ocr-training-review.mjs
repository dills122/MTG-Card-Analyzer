#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import { loadManifest } from "../src/regression/manifest.mjs";
import { stageTrainingReviewBatch } from "../src/training/training-review-stager.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultManifest = path.join(repositoryRoot, "test/regression/fixtures/manifest.json");
const defaultOutputRoot = path.join(repositoryRoot, "artifacts/training-review");
const defaultRightsBasis =
    "Wizards Fan Content Policy (https://company.wizards.com/en/legal/fancontentpolicy); " +
    "unofficial, noncommercial, review-only local artifact";
const BATCH_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function collect(value, previous) {
    return previous.concat(value);
}

function buildProgram() {
    return new Command()
        .name("stage-ocr-training-review")
        .description("Stage local, unreviewed OCR line crops from disabled regression candidates")
        .requiredOption("--batch <id>", "safe review batch identifier")
        .option("-c, --case <id>", "disabled regression fixture ID (repeatable)", collect, [])
        .option("-m, --manifest <path>", "regression fixture manifest", defaultManifest)
        .option("--output-root <directory>", "ignored review artifact root", defaultOutputRoot)
        .option("--rights-basis <text>", "source rights/provenance note", defaultRightsBasis);
}

async function main(argv = process.argv, overrides = {}) {
    const {
        loadManifest: loadRegressionManifest = loadManifest,
        stageTrainingReviewBatch: stageBatch = stageTrainingReviewBatch,
        writeLine = console.log
    } = overrides;
    const options = buildProgram().parse(argv).opts();
    if (!BATCH_PATTERN.test(options.batch)) {
        throw new Error(
            "Batch ID must use lowercase letters, numbers, dots, dashes, or underscores"
        );
    }
    if (options.case.length === 0) {
        throw new Error("At least one --case fixture ID is required");
    }

    const regressionManifest = await loadRegressionManifest(options.manifest);
    const outputDirectory = path.resolve(options.outputRoot, options.batch);
    const report = await stageBatch(regressionManifest, {
        caseIds: options.case,
        outputDirectory,
        rightsBasis: options.rightsBasis
    });
    writeLine(`Training review batch: ${report.samples.length} unreviewed sample(s)`);
    writeLine(`Review directory: ${outputDirectory}`);
    return report;
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}

export { buildProgram, main };
