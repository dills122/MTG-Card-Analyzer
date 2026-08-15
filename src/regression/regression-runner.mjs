import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual, promisify } from "node:util";
import textExtractionModule from "../image-analysis/extract-text.mjs";
import imageProcessorModule from "../image-processing/image-processor.mjs";
import matchNameModule from "../fuzzy-matching/match-name.mjs";
import imageHashing from "../image-hashing/hash-image.mjs";
import { materializeFixture } from "./image-fixture.mjs";
import { resolveCardName } from "../processor/name-resolver.mjs";

const noCacheOcrOptions = Object.freeze({
    cacheMethod: "none"
});
const maximumCasesPerOcrSession = 40;
const maximumOcrWorkers = 3;
const maximumRegressionShards = 16;
const runtimePolicies = Object.freeze(["strict", "report-only"]);

const silentLogger = {
    info: () => {},
    warn: () => {},
    error: () => {}
};

function reportOcrModel(ocrModel) {
    if (!ocrModel) return undefined;
    const { id, family, sha256, sizeBytes, source, engine } = ocrModel;
    return { id, family, sha256, sizeBytes, source, engine };
}

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
    return promisify(extractor.extract.bind(extractor))();
}

function hashImage(imagePath, dependencies) {
    return promisify(dependencies.Hash.hashImage)(imagePath);
}

function comparisonScore(comparison) {
    return Math.round(comparison.similarity * 10000) / 10000;
}

async function rankPrintCandidates(imagePath, cards, dependencies) {
    if (cards.length === 0) {
        return [];
    }
    const localHash = await hashImage(imagePath, dependencies);
    return Promise.all(
        cards.map(async (card) => {
            const referenceHash = await hashImage(card.referenceImagePath, dependencies);
            const comparison = dependencies.Hash.compareHash(localHash, referenceHash);
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
    if (
        expected.scryfallId &&
        String(selectedCard?.scryfallId || "") !== String(expected.scryfallId)
    ) {
        failures.push(
            `Scryfall print ID: expected ${expected.scryfallId}, received ${selectedCard?.scryfallId || "no match"}`
        );
    }
    if ((result.selectedPrint?.score || 0) < minPrintScore) {
        failures.push(
            `print score: expected at least ${minPrintScore}, received ${result.selectedPrint?.score || 0}`
        );
    }
    failures.push(...compareMetadata(selectedCard, expected.metadata));
    return failures;
}

function evaluateRuntime(fixture, result) {
    if (
        typeof fixture.expected.maxRuntimeMs === "number" &&
        result.runtimeMs > fixture.expected.maxRuntimeMs
    ) {
        return [
            `runtime: expected at most ${fixture.expected.maxRuntimeMs}ms, received ${result.runtimeMs}ms`
        ];
    }
    return [];
}

function isExactPrintVerified(fixture, selectedPrint) {
    if (!selectedPrint?.card) return false;
    return (
        normalized(selectedPrint.card.set) === normalized(fixture.expected.set) &&
        String(selectedPrint.card.collectorNumber || "") ===
            String(fixture.expected.collectorNumber) &&
        (!fixture.expected.scryfallId ||
            String(selectedPrint.card.scryfallId || "") === String(fixture.expected.scryfallId)) &&
        selectedPrint.score >= (fixture.expected.minPrintScore ?? 0.75)
    );
}

function finalizeResult(fixture, result, runtimePolicy, correctnessFailures) {
    result.correctnessFailures = correctnessFailures || evaluateResult(fixture, result);
    result.runtimeFailures = evaluateRuntime(fixture, result);
    result.correctnessPassed = result.correctnessFailures.length === 0;
    result.performancePassed = result.runtimeFailures.length === 0;
    result.failures = [
        ...result.correctnessFailures,
        ...(runtimePolicy === "strict" ? result.runtimeFailures : [])
    ];
    result.passed = result.failures.length === 0;
    return result;
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
        const nameResolution = await resolveCardName({
            filePath: imagePath,
            directory,
            ImageProcessor: dependencies.ImageProcessor,
            MatchName: dependencies.MatchName,
            ocrOptions: dependencies.ocrOptions,
            persistArtifacts: false,
            logger: silentLogger,
            titleExtractionResults: ocr,
            matchDependencies: {
                getNames: async () => context.cardNames
            }
        });
        const nameMatches = nameResolution.matches;
        const resolvedOcr = nameResolution.extractionResults || ocr;
        timings.nameResolutionMs = elapsedSince(stageStartedAt);
        timings.nameMatchMs = nameResolution.timings?.totalMatchMs ?? timings.nameResolutionMs;
        timings.fallbackOcrMs = nameResolution.timings?.totalFallbackOcrMs ?? 0;
        timings.fallbackTitleOcrMs = nameResolution.timings?.fallbackTitleOcrMs ?? 0;
        timings.supplementalOcrMs = nameResolution.timings?.supplementalOcrMs ?? 0;

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
                cleanText: resolvedOcr.cleanText,
                dirtyText: resolvedOcr.dirtyText,
                confidence: resolvedOcr.confidence || 0,
                variant: resolvedOcr.bestVariant?.region || "",
                // Whether the source image was below the standard OCR minimum and had to be
                // processed through the undersized-input path (see GitHub issue #156).
                upscaled: Boolean(resolvedOcr.sourceSizing?.upscaled),
                upscaleFactor: resolvedOcr.sourceSizing?.upscaleFactor || 1
            },
            nameMatches,
            nameCandidateCount: nameMatches.length,
            printCandidateCount: printCandidates.length,
            selectedPrint: rankedPrints[0] || null,
            exactPrintVerified: false,
            setVerified: false,
            timings,
            runtimeMs: elapsedSince(startedAt),
            correctnessFailures: [],
            runtimeFailures: [],
            correctnessPassed: false,
            performancePassed: false,
            failures: [],
            passed: false
        };
        result.exactPrintVerified = isExactPrintVerified(fixture, result.selectedPrint);
        // Backward-compatible report field for existing consumers. Exact print verification
        // additionally checks Scryfall ID whenever a fixture supplies one.
        result.setVerified = result.exactPrintVerified;
        return finalizeResult(fixture, result, context.runtimePolicy);
    } catch (err) {
        return finalizeResult(
            fixture,
            {
                id: fixture.id,
                quality: fixture.quality,
                blocking: fixture.blocking !== false,
                sourceImage: fixture.image,
                expected: fixture.expected,
                ocr: {
                    cleanText: "",
                    dirtyText: "",
                    confidence: 0,
                    variant: "",
                    upscaled: false,
                    upscaleFactor: 1
                },
                nameMatches: [],
                nameCandidateCount: 0,
                printCandidateCount: 0,
                selectedPrint: null,
                exactPrintVerified: false,
                setVerified: false,
                timings,
                runtimeMs: elapsedSince(startedAt),
                correctnessFailures: [err?.message || String(err)],
                runtimeFailures: [],
                correctnessPassed: false,
                performancePassed: false,
                failures: [],
                passed: false
            },
            context.runtimePolicy,
            [err?.message || String(err)]
        );
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
    // Every reviewed fixture identifies a printing by set + collector number. A supplied
    // Scryfall ID strengthens that identity check, but is not required for the fixture to
    // contribute to the exact-print metric.
    const exactPrintResults = results;
    return {
        total: results.length,
        passed,
        failed: results.length - passed,
        passRate: results.length ? Math.round((passed / results.length) * 10000) / 100 : 0,
        // Fixtures whose source image was below the standard OCR minimum and went through the
        // undersized-input path instead of being rejected outright (see GitHub issue #156).
        undersizedInputs: results.filter((result) => result.ocr.upscaled).length,
        totalRuntimeMs: Math.round(runtimes.reduce((sum, runtime) => sum + runtime, 0) * 100) / 100,
        meanRuntimeMs: results.length
            ? Math.round(
                  (runtimes.reduce((sum, runtime) => sum + runtime, 0) / results.length) * 100
              ) / 100
            : 0,
        p95RuntimeMs: runtimes[percentileIndex] || 0,
        exactPrints: {
            total: exactPrintResults.length,
            verified: exactPrintResults.filter((result) => result.exactPrintVerified).length
        },
        runtimeViolations: results.filter((result) => result.runtimeFailures?.length > 0).length,
        byQuality
    };
}

function summarizeGate(results, passedProperty = "passed") {
    const blockingResults = results.filter((result) => result.blocking !== false);
    const passed = blockingResults.filter((result) => result[passedProperty]).length;
    const nonBlockingResults = results.filter((result) => result.blocking === false);
    return {
        total: blockingResults.length,
        passed,
        failed: blockingResults.length - passed,
        nonBlocking: nonBlockingResults.length,
        nonBlockingFailed: nonBlockingResults.filter((result) => !result[passedProperty]).length
    };
}

function resolveRuntimePolicy(value) {
    const policy = value ?? "strict";
    if (!runtimePolicies.includes(policy)) {
        throw new Error(`Runtime policy must be one of: ${runtimePolicies.join(", ")}`);
    }
    return policy;
}

function resolveRegressionShard(value) {
    if (value == null) return null;
    if (
        !Number.isInteger(value.index) ||
        !Number.isInteger(value.count) ||
        value.count < 1 ||
        value.count > maximumRegressionShards ||
        value.index < 1 ||
        value.index > value.count
    ) {
        throw new Error(
            `Regression shard must use a 1-based index and a count from 1 to ${maximumRegressionShards}`
        );
    }
    return { index: value.index, count: value.count };
}

function selectRegressionShard(cases, shard) {
    if (!shard) return cases;
    return cases.filter((_fixture, index) => index % shard.count === shard.index - 1);
}

function resolveOcrWorkerCount(value) {
    const workerCount = value ?? 1;
    if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > maximumOcrWorkers) {
        throw new Error(`OCR worker count must be an integer from 1 to ${maximumOcrWorkers}`);
    }
    return workerCount;
}

function shardCases(cases, workerCount) {
    const shardCount = Math.min(workerCount, cases.length);
    const shards = Array.from({ length: shardCount }, () => []);
    cases.forEach((fixture, index) => {
        shards[index % shardCount].push({ fixture, index });
    });
    return shards;
}

async function runRegression(manifest, options = {}) {
    const workerCount = resolveOcrWorkerCount(options.workers);
    const runtimePolicy = resolveRuntimePolicy(options.runtimePolicy);
    const regressionShard = resolveRegressionShard(options.shard);
    const ocrOptions = options.ocrModel
        ? {
              ...noCacheOcrOptions,
              langPath: options.ocrModel.languagePath,
              gzip: false
          }
        : noCacheOcrOptions;
    const dependencies = {
        ImageProcessor: imageProcessorModule,
        MatchName: matchNameModule,
        Hash: imageHashing,
        materializeFixture,
        createOcrSession: textExtractionModule.createOcrSession,
        ...(options.dependencies || {}),
        // Regression isolation is an invariant, not a caller-selectable optimization.
        ocrOptions
    };
    const activeCatalog = manifest.catalog.filter((card) => card.enabled !== false);
    const activeCases = manifest.cases.filter((fixture) => fixture.enabled !== false);
    const matchingCases = activeCases.filter((fixture) => {
        if (options.caseIds?.length && !options.caseIds.includes(fixture.id)) return false;
        if (options.qualities?.length && !options.qualities.includes(fixture.quality)) return false;
        return true;
    });
    const selectedCases = selectRegressionShard(matchingCases, regressionShard);
    if (selectedCases.length === 0) {
        throw new Error("No regression cases matched the requested filters");
    }

    const cardNames = [...new Set(activeCatalog.map((card) => card.name))].map((name) => ({
        name
    }));
    const context = { cardNames, catalog: activeCatalog, runtimePolicy };
    const managesOcrSession =
        dependencies.ImageProcessor === imageProcessorModule ||
        typeof options.dependencies?.createOcrSession === "function";

    async function runShard(shard) {
        const shardDependencies = { ...dependencies, ocrOptions };
        const indexedResults = [];
        let ocrSession;

        async function startOcrSession() {
            await ocrSession?.terminate();
            ocrSession = undefined;
            ocrSession = await dependencies.createOcrSession({
                ...ocrOptions,
                logger: silentLogger
            });
            shardDependencies.ocrOptions = { ...ocrOptions, session: ocrSession };
        }

        try {
            for (const [shardIndex, { fixture, index }] of shard.entries()) {
                if (managesOcrSession && shardIndex % maximumCasesPerOcrSession === 0) {
                    await startOcrSession();
                }
                indexedResults.push({
                    index,
                    result: await analyzeFixture(fixture, manifest, context, shardDependencies)
                });
            }
            return indexedResults;
        } finally {
            await ocrSession?.terminate();
        }
    }

    const startedAt = performance.now();
    const shards = shardCases(selectedCases, workerCount);
    const shardRuns = await Promise.allSettled(shards.map(runShard));
    const failedShard = shardRuns.find((result) => result.status === "rejected");
    if (failedShard) {
        throw failedShard.reason;
    }
    const results = shardRuns
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
        .flat()
        .sort((left, right) => left.index - right.index)
        .map(({ result }) => result);
    const lifecyclePrefix =
        shards.length === 1
            ? "shared sequentially"
            : `${shards.length} parallel shards; each shared`;
    return {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        manifest: manifest.path,
        offline: true,
        runtimePolicy,
        selection: {
            matchedCases: matchingCases.length,
            selectedCases: selectedCases.length,
            shard: regressionShard
        },
        ocrModel: reportOcrModel(options.ocrModel),
        isolation: {
            applicationPersistence: "disabled",
            imageHashCache: "disabled",
            ocrCache: "disabled",
            ocrWorkers: shards.length,
            ocrLanguageSource: options.ocrModel
                ? `OCR candidate ${options.ocrModel.id}`
                : "bundled official tessdata_best eng.traineddata",
            ocrWorkerLifecycle:
                `${lifecyclePrefix} for at most ${maximumCasesPerOcrSession} cases; ` +
                "adaptive state reset per crop",
            temporaryArtifacts: "deleted after each case"
        },
        pending: {
            catalogEntries: manifest.catalog.length - activeCatalog.length,
            cases: manifest.cases.length - activeCases.length,
            placeholderCases: manifest.cases.filter((fixture) =>
                JSON.stringify(fixture).includes("CHANGE_ME")
            ).length
        },
        summary: {
            ...summarize(results),
            wallRuntimeMs: elapsedSince(startedAt)
        },
        gate: summarizeGate(results),
        correctnessGate: summarizeGate(results, "correctnessPassed"),
        performanceGate: summarizeGate(results, "performancePassed"),
        results
    };
}

export {
    analyzeFixture,
    comparisonScore,
    evaluateResult,
    evaluateRuntime,
    maximumCasesPerOcrSession,
    maximumOcrWorkers,
    maximumRegressionShards,
    rankPrintCandidates,
    resolveRegressionShard,
    resolveOcrWorkerCount,
    resolveRuntimePolicy,
    runRegression,
    selectRegressionShard,
    shardCases,
    summarize,
    summarizeGate
};

export default {
    analyzeFixture,
    comparisonScore,
    evaluateResult,
    evaluateRuntime,
    maximumCasesPerOcrSession,
    maximumOcrWorkers,
    maximumRegressionShards,
    rankPrintCandidates,
    resolveRegressionShard,
    resolveOcrWorkerCount,
    resolveRuntimePolicy,
    runRegression,
    selectRegressionShard,
    shardCases,
    summarize,
    summarizeGate
};
