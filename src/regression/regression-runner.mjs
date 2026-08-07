import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import imageProcessorModule from "../image-processing/image-processor.mjs";
import matchNameModule from "../fuzzy-matching/match-name.mjs";
import imageHashing from "../image-hashing/hash-image.mjs";
import { materializeFixture } from "./image-fixture.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const noCacheOcrOptions = Object.freeze({
    cacheMethod: "none",
    langPath: repositoryRoot,
    gzip: false
});

const silentLogger = {
    info: () => {},
    error: () => {}
};

function normalized(value) {
    return String(value || "")
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase();
}

function elapsedSince(startedAt) {
    return Math.round((performance.now() - startedAt) * 100) / 100;
}

function extractName(imagePath, directory, dependencies) {
    const extractor = dependencies.ImageProcessor.create({
        path: imagePath,
        type: "name",
        directory,
        ocrOptions: dependencies.ocrOptions,
        persistArtifacts: false,
        logger: silentLogger
    });
    return new Promise((resolve, reject) => {
        extractor.extract((err, result) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(result);
        });
    });
}

function hashImage(imagePath, dependencies) {
    return new Promise((resolve, reject) => {
        dependencies.Hash.HashImage(imagePath, (err, hash) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(hash);
        });
    });
}

function comparisonScore(comparison) {
    return (
        Math.round(
            (comparison.stringCompare * 0.5 +
                comparison.twoBitMatches * 0.3 +
                comparison.fourBitMatches * 0.2) *
                10000
        ) / 10000
    );
}

async function rankPrintCandidates(imagePath, cards, dependencies) {
    if (cards.length === 0) {
        return [];
    }
    const localHash = await hashImage(imagePath, dependencies);
    return Promise.all(
        cards.map(async (card) => {
            const referenceHash = await hashImage(card.referenceImagePath, dependencies);
            const comparison = dependencies.Hash.CompareHash(localHash, referenceHash);
            return {
                card,
                comparison,
                score: comparisonScore(comparison)
            };
        })
    ).then((ranked) => ranked.sort((left, right) => right.score - left.score));
}

function compareMetadata(actualCard, expectedMetadata = {}) {
    return Object.entries(expectedMetadata)
        .filter(([key, expectedValue]) => !isDeepStrictEqual(actualCard?.[key], expectedValue))
        .map(
            ([key, expectedValue]) =>
                `metadata.${key}: expected ${JSON.stringify(
                    expectedValue
                )}, received ${JSON.stringify(actualCard?.[key])}`
        );
}

function evaluateResult(fixture, result) {
    const failures = [];
    const expected = fixture.expected;
    const topNameMatch = result.nameMatches[0];
    const selectedCard = result.selectedPrint?.card;
    const minPrintScore = expected.minPrintScore ?? 0.75;

    if (!result.ocr.cleanText) {
        failures.push("OCR returned no normalized text");
    }
    if (normalized(topNameMatch?.name) !== normalized(expected.name)) {
        failures.push(
            `name: expected ${expected.name}, received ${topNameMatch?.name || "no match"}`
        );
    }
    if (
        typeof expected.minNameScore === "number" &&
        (topNameMatch?.percentage || 0) < expected.minNameScore
    ) {
        failures.push(
            `name score: expected at least ${expected.minNameScore}, received ${
                topNameMatch?.percentage || 0
            }`
        );
    }
    if (
        typeof expected.minOcrConfidence === "number" &&
        result.ocr.confidence < expected.minOcrConfidence
    ) {
        failures.push(
            `OCR confidence: expected at least ${expected.minOcrConfidence}, received ${result.ocr.confidence}`
        );
    }
    if (
        typeof expected.maxNameCandidates === "number" &&
        result.nameCandidateCount > expected.maxNameCandidates
    ) {
        failures.push(
            `name candidates: expected at most ${expected.maxNameCandidates}, received ${result.nameCandidateCount}`
        );
    }
    if (
        typeof expected.maxPrintCandidates === "number" &&
        result.printCandidateCount > expected.maxPrintCandidates
    ) {
        failures.push(
            `print candidates: expected at most ${expected.maxPrintCandidates}, received ${result.printCandidateCount}`
        );
    }
    if (normalized(selectedCard?.set) !== normalized(expected.set)) {
        failures.push(`set: expected ${expected.set}, received ${selectedCard?.set || "no match"}`);
    }
    if (String(selectedCard?.collectorNumber || "") !== String(expected.collectorNumber)) {
        failures.push(
            `collector number: expected ${expected.collectorNumber}, received ${
                selectedCard?.collectorNumber || "no match"
            }`
        );
    }
    if ((result.selectedPrint?.score || 0) < minPrintScore) {
        failures.push(
            `print score: expected at least ${minPrintScore}, received ${result.selectedPrint?.score || 0}`
        );
    }
    failures.push(...compareMetadata(selectedCard, expected.metadata));
    if (typeof expected.maxRuntimeMs === "number" && result.runtimeMs > expected.maxRuntimeMs) {
        failures.push(
            `runtime: expected at most ${expected.maxRuntimeMs}ms, received ${result.runtimeMs}ms`
        );
    }
    return failures;
}

async function analyzeFixture(fixture, manifest, context, dependencies) {
    const startedAt = performance.now();
    const timings = {};
    const directory = await mkdtemp(path.join(os.tmpdir(), "mtg-regression-"));
    try {
        let stageStartedAt = performance.now();
        const imagePath = await dependencies.materializeFixture(fixture, directory);
        timings.fixtureMs = elapsedSince(stageStartedAt);

        stageStartedAt = performance.now();
        const ocr = await extractName(imagePath, directory, dependencies);
        timings.ocrMs = elapsedSince(stageStartedAt);

        stageStartedAt = performance.now();
        const nameMatches = await dependencies.MatchName.create({
            cleanText: ocr.cleanText,
            dirtyText: ocr.dirtyText,
            dependencies: {
                GetNames: async () => context.cardNames
            },
            logger: silentLogger
        }).Match();
        timings.nameMatchMs = elapsedSince(stageStartedAt);

        const topName = nameMatches[0]?.name;
        const printCandidates = topName
            ? context.catalog.filter((card) => normalized(card.name) === normalized(topName))
            : [];
        stageStartedAt = performance.now();
        const rankedPrints = await rankPrintCandidates(imagePath, printCandidates, dependencies);
        timings.printMatchMs = elapsedSince(stageStartedAt);

        const result = {
            id: fixture.id,
            quality: fixture.quality,
            blocking: fixture.blocking !== false,
            sourceImage: fixture.image,
            expected: fixture.expected,
            ocr: {
                cleanText: ocr.cleanText,
                dirtyText: ocr.dirtyText,
                confidence: ocr.confidence || 0,
                variant: ocr.bestVariant?.region || ""
            },
            nameMatches,
            nameCandidateCount: nameMatches.length,
            printCandidateCount: printCandidates.length,
            selectedPrint: rankedPrints[0] || null,
            setVerified: false,
            timings,
            runtimeMs: elapsedSince(startedAt),
            failures: [],
            passed: false
        };
        result.setVerified =
            normalized(result.selectedPrint?.card?.set) === normalized(fixture.expected.set) &&
            String(result.selectedPrint?.card?.collectorNumber || "") ===
                String(fixture.expected.collectorNumber) &&
            result.selectedPrint.score >= (fixture.expected.minPrintScore ?? 0.75);
        result.failures = evaluateResult(fixture, result);
        result.passed = result.failures.length === 0;
        return result;
    } catch (err) {
        return {
            id: fixture.id,
            quality: fixture.quality,
            blocking: fixture.blocking !== false,
            sourceImage: fixture.image,
            expected: fixture.expected,
            ocr: { cleanText: "", dirtyText: "", confidence: 0, variant: "" },
            nameMatches: [],
            nameCandidateCount: 0,
            printCandidateCount: 0,
            selectedPrint: null,
            setVerified: false,
            timings,
            runtimeMs: elapsedSince(startedAt),
            failures: [err?.message || String(err)],
            passed: false
        };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

function summarize(results) {
    const runtimes = results.map((result) => result.runtimeMs).sort((a, b) => a - b);
    const passed = results.filter((result) => result.passed).length;
    const percentileIndex = Math.max(0, Math.ceil(runtimes.length * 0.95) - 1);
    const byQuality = Object.fromEntries(
        [...new Set(results.map((result) => result.quality))].map((quality) => {
            const qualityResults = results.filter((result) => result.quality === quality);
            return [
                quality,
                {
                    total: qualityResults.length,
                    passed: qualityResults.filter((result) => result.passed).length
                }
            ];
        })
    );
    return {
        total: results.length,
        passed,
        failed: results.length - passed,
        passRate: results.length ? Math.round((passed / results.length) * 10000) / 100 : 0,
        totalRuntimeMs: Math.round(runtimes.reduce((sum, runtime) => sum + runtime, 0) * 100) / 100,
        meanRuntimeMs: results.length
            ? Math.round(
                  (runtimes.reduce((sum, runtime) => sum + runtime, 0) / results.length) * 100
              ) / 100
            : 0,
        p95RuntimeMs: runtimes[percentileIndex] || 0,
        byQuality
    };
}

function summarizeGate(results) {
    const blockingResults = results.filter((result) => result.blocking !== false);
    const passed = blockingResults.filter((result) => result.passed).length;
    const nonBlockingResults = results.filter((result) => result.blocking === false);
    return {
        total: blockingResults.length,
        passed,
        failed: blockingResults.length - passed,
        nonBlocking: nonBlockingResults.length,
        nonBlockingFailed: nonBlockingResults.filter((result) => !result.passed).length
    };
}

async function runRegression(manifest, options = {}) {
    const dependencies = {
        ImageProcessor: imageProcessorModule,
        MatchName: matchNameModule,
        Hash: imageHashing,
        materializeFixture,
        ...(options.dependencies || {}),
        // Regression isolation is an invariant, not a caller-selectable optimization.
        ocrOptions: noCacheOcrOptions
    };
    const activeCatalog = manifest.catalog.filter((card) => card.enabled !== false);
    const activeCases = manifest.cases.filter((fixture) => fixture.enabled !== false);
    const selectedCases = activeCases.filter((fixture) => {
        if (options.caseIds?.length && !options.caseIds.includes(fixture.id)) return false;
        if (options.qualities?.length && !options.qualities.includes(fixture.quality)) return false;
        return true;
    });
    if (selectedCases.length === 0) {
        throw new Error("No regression cases matched the requested filters");
    }

    const cardNames = [...new Set(activeCatalog.map((card) => card.name))].map((name) => ({
        name
    }));
    const context = { cardNames, catalog: activeCatalog };
    const results = [];
    for (const fixture of selectedCases) {
        results.push(await analyzeFixture(fixture, manifest, context, dependencies));
    }
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        manifest: manifest.path,
        offline: true,
        isolation: {
            applicationPersistence: "disabled",
            imageHashCache: "disabled",
            ocrCache: "disabled",
            ocrLanguageSource: "bundled eng.traineddata",
            temporaryArtifacts: "deleted after each case"
        },
        pending: {
            catalogEntries: manifest.catalog.length - activeCatalog.length,
            cases: manifest.cases.length - activeCases.length,
            placeholderCases: manifest.cases.filter((fixture) =>
                JSON.stringify(fixture).includes("CHANGE_ME")
            ).length
        },
        summary: summarize(results),
        gate: summarizeGate(results),
        results
    };
}

export {
    analyzeFixture,
    comparisonScore,
    evaluateResult,
    rankPrintCandidates,
    runRegression,
    summarize,
    summarizeGate
};

export default {
    analyzeFixture,
    comparisonScore,
    evaluateResult,
    rankPrintCandidates,
    runRegression,
    summarize,
    summarizeGate
};
