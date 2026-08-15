#!/usr/bin/env node

// Exploratory spike only: measure how well cheap, OCR-free raster signals separate the proxy
// layout labels already present in the regression corpus. This does not select production crops.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "../src/regression/manifest.mjs";
import { materializeFixture } from "../src/regression/image-fixture.mjs";
import { readImage } from "../src/image-processing/util.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultManifest = path.resolve(scriptDirectory, "../test/regression/fixtures/manifest.json");
const targetWidth = 64;
const targetHeight = 88;
const gridColumns = 8;
const gridRows = 11;
const maximumCases = 300;
const labels = ["vintage", "nonstandard", "standard"];
const nonstandardStyles = new Set([
    "borderless",
    "extended-art",
    "full-art",
    "showcase",
    "textless"
]);
const thresholds = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5];

function normalized(value) {
    return String(value || "")
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase();
}

function findCatalogCard(fixture, catalog) {
    if (fixture.expected.scryfallId) {
        const byId = catalog.find(
            (card) => String(card.scryfallId || "") === String(fixture.expected.scryfallId)
        );
        if (byId) return byId;
    }
    return catalog.find(
        (card) =>
            normalized(card.name) === normalized(fixture.expected.name) &&
            normalized(card.set) === normalized(fixture.expected.set) &&
            String(card.collectorNumber) === String(fixture.expected.collectorNumber)
    );
}

function proxyLabel(fixture, card) {
    if (/^vtg-\d+-pending$/i.test(fixture.id)) return "vintage";
    if (nonstandardStyles.has(card?.style)) return "nonstandard";
    if (card?.style === "normal") return "standard";
    return null;
}

function mean(values) {
    return values.reduce((total, value) => total + value, 0) / values.length;
}

function cellFeatures(image, startX, startY, endX, endY) {
    const luminances = [];
    const saturations = [];
    let horizontalEdge = 0;
    let horizontalComparisons = 0;
    let verticalEdge = 0;
    let verticalComparisons = 0;

    for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
            const pixel = image.getPixelColor(x, y);
            const red = (pixel >>> 24) & 0xff;
            const green = (pixel >>> 16) & 0xff;
            const blue = (pixel >>> 8) & 0xff;
            const maximum = Math.max(red, green, blue);
            const minimum = Math.min(red, green, blue);
            const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
            luminances.push(luminance);
            saturations.push(maximum === 0 ? 0 : (maximum - minimum) / maximum);

            if (x + 1 < endX) {
                const neighbor = image.getPixelColor(x + 1, y);
                const neighborLuminance =
                    ((neighbor >>> 24) & 0xff) * 0.299 +
                    ((neighbor >>> 16) & 0xff) * 0.587 +
                    ((neighbor >>> 8) & 0xff) * 0.114;
                horizontalEdge += Math.abs(luminance - neighborLuminance);
                horizontalComparisons += 1;
            }
            if (y + 1 < endY) {
                const neighbor = image.getPixelColor(x, y + 1);
                const neighborLuminance =
                    ((neighbor >>> 24) & 0xff) * 0.299 +
                    ((neighbor >>> 16) & 0xff) * 0.587 +
                    ((neighbor >>> 8) & 0xff) * 0.114;
                verticalEdge += Math.abs(luminance - neighborLuminance);
                verticalComparisons += 1;
            }
        }
    }

    const averageLuminance = mean(luminances);
    const variance = mean(luminances.map((value) => (value - averageLuminance) ** 2));
    return [
        averageLuminance / 255,
        Math.sqrt(variance) / 128,
        mean(saturations),
        horizontalComparisons ? horizontalEdge / horizontalComparisons / 255 : 0,
        verticalComparisons ? verticalEdge / verticalComparisons / 255 : 0
    ];
}

async function extractFeatures(imagePath) {
    const image = await readImage(imagePath);
    image.resize({ w: targetWidth, h: targetHeight });
    const features = [];
    for (let row = 0; row < gridRows; row += 1) {
        const startY = Math.floor((row * targetHeight) / gridRows);
        const endY = Math.floor(((row + 1) * targetHeight) / gridRows);
        for (let column = 0; column < gridColumns; column += 1) {
            const startX = Math.floor((column * targetWidth) / gridColumns);
            const endX = Math.floor(((column + 1) * targetWidth) / gridColumns);
            features.push(...cellFeatures(image, startX, startY, endX, endY));
        }
    }
    return features;
}

function centroid(records) {
    return records[0].features.map((_, index) =>
        mean(records.map((record) => record.features[index]))
    );
}

function distance(left, right) {
    return Math.sqrt(mean(left.map((value, index) => (value - right[index]) ** 2)));
}

function classifyLeaveOneSourceOut(record, records) {
    const distances = labels
        .map((label) => {
            const training = records.filter(
                (candidate) => candidate.label === label && candidate.source !== record.source
            );
            return {
                label,
                distance: training.length ? distance(record.features, centroid(training)) : Infinity
            };
        })
        .sort((left, right) => left.distance - right.distance);
    const [first, second] = distances;
    const margin = Number.isFinite(second.distance)
        ? Math.max(0, (second.distance - first.distance) / Math.max(second.distance, 1e-9))
        : 0;
    return { actual: record.label, predicted: first.label, margin, id: record.id };
}

function round(value, places = 3) {
    const scale = 10 ** places;
    return Math.round(value * scale) / scale;
}

function summarizeThreshold(predictions, threshold) {
    const classified = predictions.filter((prediction) => prediction.margin >= threshold);
    const correct = classified.filter(
        (prediction) => prediction.actual === prediction.predicted
    ).length;
    const precisionByPredictedClass = Object.fromEntries(
        labels.map((label) => {
            const predicted = classified.filter((prediction) => prediction.predicted === label);
            const classCorrect = predicted.filter(
                (prediction) => prediction.actual === label
            ).length;
            return [
                label,
                {
                    predicted: predicted.length,
                    precision: predicted.length ? round(classCorrect / predicted.length) : null
                }
            ];
        })
    );
    const recallByActualClass = Object.fromEntries(
        labels.map((label) => {
            const actual = predictions.filter((prediction) => prediction.actual === label);
            const classCorrect = classified.filter(
                (prediction) => prediction.actual === label && prediction.predicted === label
            ).length;
            return [label, round(classCorrect / actual.length)];
        })
    );
    return {
        threshold,
        classified: classified.length,
        coverage: round(classified.length / predictions.length),
        precision: classified.length ? round(correct / classified.length) : null,
        precisionByPredictedClass,
        recallByActualClass
    };
}

async function main(manifestPath = process.argv[2] || defaultManifest) {
    const manifest = await loadManifest(manifestPath);
    const activeCatalog = manifest.catalog.filter((card) => card.enabled !== false);
    const candidates = manifest.cases
        .filter((fixture) => fixture.enabled !== false)
        .map((fixture) => {
            const card = findCatalogCard(fixture, activeCatalog);
            return { fixture, label: proxyLabel(fixture, card) };
        })
        .filter((candidate) => candidate.label);
    if (candidates.length > maximumCases) {
        throw new Error(`Layout signal spike is limited to ${maximumCases} fixtures`);
    }

    const directory = await mkdtemp(path.join(os.tmpdir(), "mtg-layout-signal-spike-"));
    try {
        const records = [];
        for (const { fixture, label } of candidates) {
            const imagePath = await materializeFixture(fixture, directory);
            records.push({
                id: fixture.id,
                label,
                source: fixture.imagePath,
                features: await extractFeatures(imagePath)
            });
        }
        const predictions = records.map((record) => classifyLeaveOneSourceOut(record, records));
        const result = {
            warning:
                "Exploratory proxy-label result only; do not use these margins as production confidence.",
            method: `${gridColumns}x${gridRows} luminance/saturation/edge grid; leave-one-source-image-out class centroids`,
            cases: records.length,
            sourceImages: new Set(records.map((record) => record.source)).size,
            labels: Object.fromEntries(
                labels.map((label) => [
                    label,
                    records.filter((record) => record.label === label).length
                ])
            ),
            thresholds: thresholds.map((threshold) => summarizeThreshold(predictions, threshold))
        };
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
});
