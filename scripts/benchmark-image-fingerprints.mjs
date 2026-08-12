#!/usr/bin/env node

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
    compareFingerprints,
    decodeImage,
    fingerprintImage,
    fingerprintPixels,
    PDQ_STARTING_POLICY
} from "image-fingerprint/node";
import { readImage } from "../src/image-processing/util.mjs";
import { cropSetSymbolFromImage } from "../src/image-processing/smart-crop.mjs";
import { materializeFixture } from "../src/regression/image-fixture.mjs";
import { loadManifest } from "../src/regression/manifest.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const manifestPath = path.join(repositoryRoot, "test/regression/fixtures/manifest.json");

const APPLICATION_POLICIES = Object.freeze([
    {
        id: "pdq-starting-policy",
        minSimilarity: 1 - PDQ_STARTING_POLICY.maxDistance / 256,
        minQuality: PDQ_STARTING_POLICY.minQuality,
        maxCandidates: 3,
        maxSimilarityDeltaFromTop: 0.03
    },
    {
        id: "application-fallback-0.75",
        minSimilarity: 0.75,
        minQuality: PDQ_STARTING_POLICY.minQuality,
        maxCandidates: 3,
        maxSimilarityDeltaFromTop: 0.03
    }
]);

const MODES = [
    {
        id: "blockhash-v1-image-hash-v7",
        async fingerprint(source) {
            return fingerprintImage(source, {
                algorithm: "blockhash-v1",
                bitsPerSide: 16,
                method: 2,
                decoderMode: "image-hash-v7"
            });
        }
    },
    {
        id: "blockhash-v1-normalized",
        async fingerprint(source) {
            const pixels = await decodeImage(source);
            return fingerprintPixels(pixels, {
                algorithm: "blockhash-v1",
                bitsPerSide: 16,
                method: 2
            });
        }
    },
    {
        id: "pdq-v1-normalized",
        async fingerprint(source) {
            const pixels = await decodeImage(source);
            return fingerprintPixels(pixels, { algorithm: "pdq-v1" });
        }
    }
];

const VARIANTS = [
    ["exact", {}],
    ["good-photo", { brightness: -0.04, contrast: -0.03 }],
    ["average-photo", { brightness: -0.12, contrast: -0.08, blur: 1 }],
    ["poor-lighting", { brightness: -0.35, contrast: -0.12 }],
    ["blur", { blur: 1 }],
    ["rotation", { rotate: 0.25 }],
    ["cropping", { crop: { left: 0, top: 0, right: 0.015, bottom: 0.015 } }],
    ["low-resolution", { resize: { width: 600, height: 836 } }]
];

function identity(card) {
    return `${card.name}|${card.set}|${card.collectorNumber}`;
}

function evenlySample(items, count) {
    if (items.length <= count) return [...items];
    return Array.from({ length: count }, (_unused, index) => {
        const selectedIndex = Math.round((index * (items.length - 1)) / (count - 1));
        return items[selectedIndex];
    });
}

function score(left, right) {
    const comparison = compareFingerprints(left, right);
    if (!comparison.comparable) {
        throw new Error(`Unexpected incompatible fingerprints: ${comparison.reason}`);
    }
    return {
        similarity: 1 - comparison.normalizedDistance,
        distance: comparison.distance
    };
}

function round(value, digits = 4) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

async function writeSetSymbol(source, directory, label) {
    const image = await readImage(source);
    const crop = cropSetSymbolFromImage(image);
    if (crop.lowConfidence) {
        throw new Error(`${label}: set-symbol crop is low confidence (${crop.reason})`);
    }
    const output = path.join(directory, `${label.replace(/[^a-z0-9-]/gi, "-")}.png`);
    await crop.image.write(output);
    return output;
}

async function materializeVariant(card, variant, directory) {
    const [quality, transform] = variant;
    return materializeFixture(
        {
            id: `${identity(card)}-${quality}`,
            imagePath: card.referenceImagePath,
            transform
        },
        directory
    );
}

function summarize(rows) {
    const correct = rows.filter((row) => row.rank === 1).length;
    const byVariant = Object.fromEntries(
        VARIANTS.map(([variant]) => {
            const selected = rows.filter((row) => row.variant === variant);
            return [
                variant,
                {
                    total: selected.length,
                    top1: selected.filter((row) => row.rank === 1).length,
                    meanPositiveSimilarity: round(
                        average(selected.map((row) => row.positiveSimilarity))
                    ),
                    meanMargin: round(average(selected.map((row) => row.margin)))
                }
            ];
        })
    );
    return {
        total: rows.length,
        top1: correct,
        top1Rate: round(correct / rows.length),
        top5: rows.filter((row) => row.rank <= 5).length,
        meanReciprocalRank: round(average(rows.map((row) => 1 / row.rank))),
        meanPositiveSimilarity: round(average(rows.map((row) => row.positiveSimilarity))),
        meanClosestNegativeSimilarity: round(
            average(rows.map((row) => row.closestNegativeSimilarity))
        ),
        meanMargin: round(average(rows.map((row) => row.margin))),
        lowQuality: rows.filter((row) => row.quality !== undefined && row.quality < 50).length,
        byVariant
    };
}

function evaluateApplicationPolicy(rows, policy) {
    const results = rows.map((row) => {
        const qualityEligible =
            row.queryQuality === undefined ||
            (row.queryQuality >= policy.minQuality && row.topQuality >= policy.minQuality);
        const scoreEligible = row.topSimilarity >= policy.minSimilarity;
        const selected = qualityEligible && scoreEligible ? row.candidatesWithinDelta : [];
        return {
            selected,
            correct: selected.includes(row.card),
            ambiguous: selected.length > 1
        };
    });
    const accepted = results.filter((result) => result.selected.length > 0);
    const correct = accepted.filter((result) => result.correct);
    return {
        policy,
        total: rows.length,
        accepted: accepted.length,
        abstained: rows.length - accepted.length,
        correct: correct.length,
        incorrect: accepted.length - correct.length,
        ambiguous: accepted.filter((result) => result.ambiguous).length,
        precision: round(correct.length / (accepted.length || 1)),
        recall: round(correct.length / rows.length)
    };
}

function applicationCalibration(rows, mode) {
    if (mode.id !== "pdq-v1-normalized") {
        return undefined;
    }
    return APPLICATION_POLICIES.map((policy) => evaluateApplicationPolicy(rows, policy));
}

async function benchmarkMode(mode, cards, queryCards, duplicateGroups, directory) {
    const startedAt = performance.now();
    const referenceFingerprints = new Map();
    for (const card of cards) {
        referenceFingerprints.set(identity(card), await mode.fingerprint(card.referenceImagePath));
    }

    const fullCardRows = [];
    for (const card of queryCards) {
        for (const variant of VARIANTS) {
            const queryPath = await materializeVariant(card, variant, directory);
            const queryFingerprint = await mode.fingerprint(queryPath);
            const ranking = cards
                .map((candidate) => ({
                    card: candidate,
                    fingerprint: referenceFingerprints.get(identity(candidate)),
                    ...score(queryFingerprint, referenceFingerprints.get(identity(candidate)))
                }))
                .sort((left, right) => right.similarity - left.similarity);
            const expectedId = identity(card);
            const rank = ranking.findIndex((entry) => identity(entry.card) === expectedId) + 1;
            const positiveSimilarity = ranking.find(
                (entry) => identity(entry.card) === expectedId
            ).similarity;
            const closestNegativeSimilarity = ranking.find(
                (entry) => identity(entry.card) !== expectedId
            ).similarity;
            const topSimilarity = ranking[0].similarity;
            fullCardRows.push({
                card: expectedId,
                variant: variant[0],
                rank,
                positiveSimilarity,
                closestNegativeSimilarity,
                margin: positiveSimilarity - closestNegativeSimilarity,
                quality: queryFingerprint.quality,
                queryQuality: queryFingerprint.quality,
                topQuality: ranking[0].fingerprint.quality,
                topSimilarity,
                candidatesWithinDelta: ranking
                    .filter(
                        (entry) =>
                            topSimilarity - entry.similarity <=
                            APPLICATION_POLICIES[0].maxSimilarityDeltaFromTop
                    )
                    .slice(0, APPLICATION_POLICIES[0].maxCandidates)
                    .map((entry) => identity(entry.card))
            });
        }
    }

    const setSymbolRows = [];
    for (const group of duplicateGroups) {
        const referenceSymbols = new Map();
        for (const card of group) {
            const symbolPath = await writeSetSymbol(
                card.referenceImagePath,
                directory,
                `${mode.id}-${identity(card)}-reference`
            );
            referenceSymbols.set(identity(card), await mode.fingerprint(symbolPath));
        }
        for (const card of group) {
            for (const variant of VARIANTS) {
                const queryPath = await materializeVariant(card, variant, directory);
                const symbolPath = await writeSetSymbol(
                    queryPath,
                    directory,
                    `${mode.id}-${identity(card)}-${variant[0]}`
                );
                const queryFingerprint = await mode.fingerprint(symbolPath);
                const ranking = group
                    .map((candidate) => ({
                        card: candidate,
                        fingerprint: referenceSymbols.get(identity(candidate)),
                        ...score(queryFingerprint, referenceSymbols.get(identity(candidate)))
                    }))
                    .sort((left, right) => right.similarity - left.similarity);
                const expectedId = identity(card);
                const rank = ranking.findIndex((entry) => identity(entry.card) === expectedId) + 1;
                const positiveSimilarity = ranking.find(
                    (entry) => identity(entry.card) === expectedId
                ).similarity;
                const closestNegativeSimilarity = ranking.find(
                    (entry) => identity(entry.card) !== expectedId
                ).similarity;
                const topSimilarity = ranking[0].similarity;
                setSymbolRows.push({
                    card: expectedId,
                    variant: variant[0],
                    rank,
                    positiveSimilarity,
                    closestNegativeSimilarity,
                    margin: positiveSimilarity - closestNegativeSimilarity,
                    quality: queryFingerprint.quality,
                    queryQuality: queryFingerprint.quality,
                    topQuality: ranking[0].fingerprint.quality,
                    topSimilarity,
                    candidatesWithinDelta: ranking
                        .filter(
                            (entry) =>
                                topSimilarity - entry.similarity <=
                                APPLICATION_POLICIES[0].maxSimilarityDeltaFromTop
                        )
                        .slice(0, APPLICATION_POLICIES[0].maxCandidates)
                        .map((entry) => identity(entry.card))
                });
            }
        }
    }

    return {
        id: mode.id,
        runtimeMs: round(performance.now() - startedAt, 2),
        fullCard: summarize(fullCardRows),
        setSymbol: summarize(setSymbolRows),
        applicationCalibration: {
            fullCard: applicationCalibration(fullCardRows, mode),
            setSymbol: applicationCalibration(setSymbolRows, mode)
        },
        failures: {
            fullCard: fullCardRows.filter((row) => row.rank !== 1).slice(0, 20),
            setSymbol: setSymbolRows.filter((row) => row.rank !== 1).slice(0, 20)
        }
    };
}

function selectedModes(arguments_) {
    const modeIndex = arguments_.indexOf("--mode");
    if (modeIndex === -1) {
        return MODES;
    }
    const modeId = arguments_[modeIndex + 1];
    if (!modeId || modeId.startsWith("--")) {
        throw new Error("--mode requires a benchmark mode id");
    }
    const mode = MODES.find((candidate) => candidate.id === modeId);
    if (!mode) {
        throw new Error(`Unknown benchmark mode: ${modeId}`);
    }
    return [mode];
}

async function main() {
    const modes = selectedModes(process.argv.slice(2));
    const manifest = await loadManifest(manifestPath);
    const cards = manifest.catalog.filter((card) => card.enabled !== false);
    const duplicateGroups = Object.values(Object.groupBy(cards, (card) => card.name)).filter(
        (group) => group.length > 1
    );
    const mustInclude = new Set(
        cards
            .filter(
                (card) =>
                    card.name === "Pacifism" ||
                    duplicateGroups.some((group) => group.includes(card))
            )
            .map(identity)
    );
    const queryCards = [
        ...new Map(
            [
                ...evenlySample(cards, 30),
                ...cards.filter((card) => mustInclude.has(identity(card)))
            ].map((card) => [identity(card), card])
        ).values()
    ];
    const directory = await mkdtemp(path.join(os.tmpdir(), "mtg-fingerprint-benchmark-"));
    try {
        const results = [];
        for (const mode of modes) {
            console.error(`Benchmarking ${mode.id}...`);
            results.push(await benchmarkMode(mode, cards, queryCards, duplicateGroups, directory));
        }
        console.log(
            JSON.stringify(
                {
                    schemaVersion: 1,
                    manifest: path.relative(repositoryRoot, manifest.path),
                    referencePrints: cards.length,
                    fullCardQueries: queryCards.length * VARIANTS.length,
                    setSymbolQueries:
                        duplicateGroups.reduce((sum, group) => sum + group.length, 0) *
                        VARIANTS.length,
                    variants: VARIANTS.map(([id]) => id),
                    results
                },
                null,
                2
            )
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

await main();
