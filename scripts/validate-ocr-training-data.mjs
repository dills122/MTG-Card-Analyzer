#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import {
    assertTrainingDataReady,
    loadTrainingDataManifest
} from "../src/training/training-data-manifest.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultManifest = path.join(repositoryRoot, "training/ocr/manifest.json");

function buildProgram() {
    return new Command()
        .name("validate-ocr-training-data")
        .description("Verify reviewed Tesseract line images, transcriptions, and provenance")
        .option("-m, --manifest <path>", "training-data manifest", defaultManifest)
        .option("--require-ready", "fail unless the corpus is reviewed and can be split");
}

async function main(argv = process.argv, overrides = {}) {
    const {
        loadTrainingDataManifest: loadManifest = loadTrainingDataManifest,
        assertTrainingDataReady: assertReady = assertTrainingDataReady,
        writeLine = console.log
    } = overrides;
    const options = buildProgram().parse(argv).opts();
    const manifest = await loadManifest(options.manifest);

    writeLine(
        `Training data: ${manifest.samples.length} verified sample(s); status ${manifest.status}`
    );
    writeLine(`Base model: ${manifest.baseModel.id}`);
    if (options.requireReady) {
        const readiness = assertReady(manifest);
        writeLine(
            `Deterministic split: ${readiness.train} train / ${readiness.evaluation} evaluation`
        );
    }
    return manifest;
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}

export { buildProgram, main };
