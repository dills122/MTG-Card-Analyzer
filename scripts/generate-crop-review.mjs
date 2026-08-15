#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import { JimpMime } from "jimp";
import { prepareOcrVariants } from "../src/image-processing/ocr-preprocessing.mjs";
import smartCrop from "../src/image-processing/smart-crop.mjs";
import { readImage } from "../src/image-processing/util.mjs";
import { materializeFixture } from "../src/regression/image-fixture.mjs";
import { QUALITY_LEVELS, loadManifest } from "../src/regression/manifest.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultManifest = path.join(repositoryRoot, "test/regression/fixtures/manifest.json");
const defaultOutput = path.join(repositoryRoot, "public/crop-review/generated");
const cropTypes = ["name", "soft-name", "rotated-name", "type", "rules-name", "set-symbol"];
const maximumCases = 500;
const ownershipMarkerFile = ".mtg-crop-review-generated";
const ownershipMarkerContent = "MTG Card Analyzer crop-review output\n";
const quietLogger = Object.freeze({ info() {}, warn() {}, error() {} });

class GenerationInterruptedError extends Error {
    constructor(signal) {
        super(`Crop review generation interrupted by ${signal}`);
        this.name = "GenerationInterruptedError";
        this.signal = signal;
    }
}

function collect(value, previous) {
    return previous.concat(value);
}

function buildProgram() {
    return new Command()
        .name("generate-crop-review")
        .description("Generate local crop-review assets from deterministic regression fixtures")
        .option("-m, --manifest <path>", "regression fixture manifest", defaultManifest)
        .option("-o, --output <directory>", "generated public asset directory", defaultOutput)
        .option("-c, --case <id>", "fixture ID to include (repeatable)", collect, [])
        .option(
            "-q, --quality <level>",
            `quality level to include (repeatable: ${QUALITY_LEVELS.join(", ")})`,
            collect,
            []
        )
        .option(
            "-r, --region <type>",
            `crop type to generate (repeatable: ${cropTypes.join(", ")})`,
            collect,
            []
        )
        .option("--include-disabled", "include disabled regression fixtures", false);
}

function unique(values) {
    return [...new Set(values)];
}

function validateFilters(options) {
    const unknownQualities = unique(options.qualities || []).filter(
        (quality) => !QUALITY_LEVELS.includes(quality)
    );
    if (unknownQualities.length > 0) {
        throw new Error(`Unknown quality level(s): ${unknownQualities.join(", ")}`);
    }
    const unknownRegions = unique(options.regions || []).filter(
        (region) => !cropTypes.includes(region)
    );
    if (unknownRegions.length > 0) {
        throw new Error(`Unknown crop type(s): ${unknownRegions.join(", ")}`);
    }
}

function selectReviewCases(manifest, options = {}) {
    validateFilters(options);
    const requestedIds = unique(options.caseIds || []);
    const requestedQualities = new Set(options.qualities || []);
    const casesById = new Map(manifest.cases.map((fixture) => [fixture.id, fixture]));
    const unknownIds = requestedIds.filter((caseId) => !casesById.has(caseId));
    if (unknownIds.length > 0) {
        throw new Error(`Unknown regression fixture(s): ${unknownIds.join(", ")}`);
    }

    const sourceCases =
        requestedIds.length > 0
            ? requestedIds.map((caseId) => casesById.get(caseId))
            : manifest.cases;
    const fixtures = sourceCases.filter((fixture) => {
        if (!options.includeDisabled && requestedIds.length === 0 && fixture.enabled === false) {
            return false;
        }
        return requestedQualities.size === 0 || requestedQualities.has(fixture.quality);
    });
    if (fixtures.length === 0) {
        throw new Error("No regression fixtures matched the crop-review filters");
    }
    if (fixtures.length > maximumCases) {
        throw new Error(`Crop review generation is limited to ${maximumCases} fixtures`);
    }
    return fixtures;
}

function safeSegment(value) {
    const normalized = String(value)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
        .slice(0, 80);
    const suffix = createHash("sha256").update(String(value)).digest("hex").slice(0, 8);
    return `${normalized || "fixture"}-${suffix}`;
}

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

async function pathExists(target) {
    try {
        await access(target);
        return true;
    } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
    }
}

async function assertOutputDirectoryIsReplaceable(outputDirectory) {
    if (!(await pathExists(outputDirectory)) || outputDirectory === defaultOutput) return;

    let marker;
    try {
        marker = await readFile(path.join(outputDirectory, ownershipMarkerFile), "utf8");
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;
    }
    if (marker !== ownershipMarkerContent) {
        throw new Error(
            `Refusing to replace output directory not created by crop review: ${outputDirectory}`
        );
    }
}

function publicAssetPath(...segments) {
    return ["crop-review", "generated", ...segments].join("/");
}

function cropMetadata(result) {
    return {
        sourceRegion: result.region,
        searchRegion: result.searchRegion,
        contentDetected: result.contentDetected === true,
        lowConfidence: result.lowConfidence === true,
        ...(result.reason ? { reason: result.reason } : {})
    };
}

function describeTextCrops(image, type) {
    if (type === "rotated-name") return new Map();
    return new Map(
        smartCrop
            .getRegionTemplates(type)
            .map((template) => [
                template.key,
                cropMetadata(smartCrop.cropTextRegion(image, template))
            ])
    );
}

async function writeOcrCrops(fixturePath, sourceImage, type, caseDirectory, caseSlug) {
    const prepared = await prepareOcrVariants(fixturePath, type, { logger: quietLogger });
    const metadataByRegion = describeTextCrops(sourceImage, type);
    const crops = [];
    for (const variant of prepared.variants) {
        const fileName = `${safeSegment(`${type}-${variant.region}`)}.png`;
        await writeFile(path.join(caseDirectory, fileName), variant.buffer);
        crops.push({
            id: `${type}:${variant.region}`,
            type,
            region: variant.region,
            psm: variant.psm,
            src: publicAssetPath("cases", caseSlug, fileName),
            sha256: sha256(variant.buffer),
            width: variant.image.bitmap.width,
            height: variant.image.bitmap.height,
            ...(metadataByRegion.get(variant.region) || {}),
            sourceUpscaled: prepared.sourceSizing.upscaled,
            sourceUpscaleFactor: prepared.sourceSizing.upscaleFactor
        });
    }
    return crops;
}

async function writeSetSymbolCrop(sourceImage, caseDirectory, caseSlug) {
    const result = smartCrop.cropSetSymbolFromImage(sourceImage);
    const fileName = `${safeSegment("set-symbol")}.png`;
    const buffer = await result.image.getBuffer(JimpMime.png);
    await writeFile(path.join(caseDirectory, fileName), buffer);
    return {
        id: "set-symbol:set-symbol",
        type: "set-symbol",
        region: "set-symbol",
        psm: null,
        src: publicAssetPath("cases", caseSlug, fileName),
        sha256: sha256(buffer),
        width: result.image.bitmap.width,
        height: result.image.bitmap.height,
        ...cropMetadata(result)
    };
}

async function generateCase(fixture, selectedTypes, outputDirectory, workDirectory) {
    const caseSlug = safeSegment(fixture.id);
    const caseDirectory = path.join(outputDirectory, "cases", caseSlug);
    await mkdir(caseDirectory, { recursive: true });
    const fixturePath = await materializeFixture(fixture, workDirectory);
    const sourceImage = await readImage(fixturePath);
    const sourceFileName = "source.png";
    await sourceImage.write(path.join(caseDirectory, sourceFileName));

    const crops = [];
    const errors = [];
    for (const type of selectedTypes) {
        try {
            if (type === "set-symbol") {
                crops.push(await writeSetSymbolCrop(sourceImage, caseDirectory, caseSlug));
            } else {
                crops.push(
                    ...(await writeOcrCrops(
                        fixturePath,
                        sourceImage,
                        type,
                        caseDirectory,
                        caseSlug
                    ))
                );
            }
        } catch (error) {
            errors.push({ type, message: error?.message || String(error) });
        }
    }

    return {
        id: fixture.id,
        quality: fixture.quality,
        enabled: fixture.enabled !== false,
        blocking: fixture.blocking !== false,
        expected: {
            name: fixture.expected.name,
            set: fixture.expected.set,
            collectorNumber: fixture.expected.collectorNumber,
            ...(fixture.expected.metadata || {})
        },
        transform: fixture.transform,
        source: {
            src: publicAssetPath("cases", caseSlug, sourceFileName),
            width: sourceImage.bitmap.width,
            height: sourceImage.bitmap.height
        },
        crops,
        errors
    };
}

function datasetId(manifest, cases, selectedTypes) {
    const identity = {
        version: manifest.version,
        cropTypes: selectedTypes,
        setSymbolHashMode: smartCrop.setSymbolHashMode,
        cases: cases.map((fixture) => ({
            id: fixture.id,
            crops: fixture.crops.map((crop) => ({ id: crop.id, sha256: crop.sha256 })),
            errors: fixture.errors
        }))
    };
    return createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16);
}

async function generateCropReview(manifest, options = {}) {
    const fixtures = selectReviewCases(manifest, options);
    const selectedTypes = unique(options.regions?.length ? options.regions : cropTypes);
    const outputDirectory = path.resolve(options.outputDirectory || defaultOutput);
    const parentDirectory = path.dirname(outputDirectory);
    const temporaryDirectory = `${outputDirectory}.tmp-${process.pid}-${Date.now()}`;
    const workDirectory = path.join(temporaryDirectory, ".work");
    const now = options.now || (() => new Date());
    const onProgress = options.onProgress || (() => {});
    let interruptedBy;
    const recordInterruption = (signal) => {
        interruptedBy ||= signal;
    };
    const recordSigint = () => recordInterruption("SIGINT");
    const recordSigterm = () => recordInterruption("SIGTERM");
    const assertNotInterrupted = () => {
        if (interruptedBy) throw new GenerationInterruptedError(interruptedBy);
    };
    try {
        await assertOutputDirectoryIsReplaceable(outputDirectory);
        await mkdir(parentDirectory, { recursive: true });
        await mkdir(workDirectory, { recursive: true });
        process.once("SIGINT", recordSigint);
        process.once("SIGTERM", recordSigterm);
        const cases = [];
        for (let index = 0; index < fixtures.length; index++) {
            assertNotInterrupted();
            const fixture = fixtures[index];
            onProgress({ index: index + 1, total: fixtures.length, fixture });
            cases.push(
                await generateCase(fixture, selectedTypes, temporaryDirectory, workDirectory)
            );
            assertNotInterrupted();
        }
        await rm(workDirectory, { recursive: true, force: true });
        const report = {
            version: 1,
            datasetId: datasetId(manifest, cases, selectedTypes),
            generatedAt: now().toISOString(),
            sourceManifest: path.relative(repositoryRoot, manifest.path).split(path.sep).join("/"),
            setSymbolHashMode: smartCrop.setSymbolHashMode,
            cropTypes: selectedTypes,
            summary: {
                cases: cases.length,
                crops: cases.reduce((total, fixture) => total + fixture.crops.length, 0),
                errors: cases.reduce((total, fixture) => total + fixture.errors.length, 0)
            },
            cases
        };
        await writeFile(
            path.join(temporaryDirectory, "review-data.json"),
            `${JSON.stringify(report, null, 2)}\n`,
            "utf8"
        );
        await writeFile(
            path.join(temporaryDirectory, ownershipMarkerFile),
            ownershipMarkerContent,
            "utf8"
        );
        await rm(outputDirectory, { recursive: true, force: true });
        await rename(temporaryDirectory, outputDirectory);
        return report;
    } catch (error) {
        await rm(temporaryDirectory, { recursive: true, force: true });
        throw error;
    } finally {
        process.off("SIGINT", recordSigint);
        process.off("SIGTERM", recordSigterm);
    }
}

async function main(argv = process.argv, overrides = {}) {
    const {
        loadManifest: loadFixtureManifest = loadManifest,
        generateCropReview: generate = generateCropReview,
        writeLine = console.log
    } = overrides;
    const options = buildProgram().parse(argv).opts();
    validateFilters({ qualities: options.quality, regions: options.region });
    const manifest = await loadFixtureManifest(options.manifest);
    const report = await generate(manifest, {
        outputDirectory: options.output,
        caseIds: options.case,
        qualities: options.quality,
        regions: options.region,
        includeDisabled: options.includeDisabled,
        onProgress: ({ index, total, fixture }) => writeLine(`[${index}/${total}] ${fixture.id}`)
    });
    writeLine(
        `Crop review: ${report.summary.cases} fixture(s), ${report.summary.crops} crop(s), ${report.summary.errors} error(s)`
    );
    writeLine(`Review data: ${path.resolve(options.output, "review-data.json")}`);
    return report;
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error?.stack || error);
        process.exitCode = error instanceof GenerationInterruptedError ? 130 : 1;
    });
}

export {
    buildProgram,
    cropTypes,
    GenerationInterruptedError,
    generateCropReview,
    main,
    maximumCases,
    ownershipMarkerContent,
    ownershipMarkerFile,
    safeSegment,
    selectReviewCases,
    validateFilters
};
