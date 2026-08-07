import { access, readFile } from "node:fs/promises";
import path from "node:path";

const QUALITY_LEVELS = [
    "clean-scan",
    "good-photo",
    "average-photo",
    "poor-lighting",
    "blur",
    "rotation",
    "cropping",
    "low-resolution"
];

function requireString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }
}

function resolveFixturePath(manifestDirectory, fixturePath, label) {
    requireString(fixturePath, label);
    return path.resolve(manifestDirectory, fixturePath);
}

function validateExpected(expected, label) {
    if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
        throw new Error(`${label}.expected must be an object`);
    }
    requireString(expected.name, `${label}.expected.name`);
    requireString(expected.set, `${label}.expected.set`);
    requireString(expected.collectorNumber, `${label}.expected.collectorNumber`);
}

function validateManifest(rawManifest, manifestPath) {
    if (!rawManifest || typeof rawManifest !== "object" || Array.isArray(rawManifest)) {
        throw new Error("Regression manifest must be a JSON object");
    }
    if (rawManifest.version !== 1) {
        throw new Error(`Unsupported regression manifest version: ${rawManifest.version}`);
    }
    if (!Array.isArray(rawManifest.catalog) || rawManifest.catalog.length === 0) {
        throw new Error("Regression manifest catalog must contain at least one card print");
    }
    if (!Array.isArray(rawManifest.cases) || rawManifest.cases.length === 0) {
        throw new Error("Regression manifest cases must contain at least one fixture");
    }

    const manifestDirectory = path.dirname(manifestPath);
    const ids = new Set();
    const catalog = rawManifest.catalog.map((card, index) => {
        const label = `catalog[${index}]`;
        requireString(card.name, `${label}.name`);
        requireString(card.set, `${label}.set`);
        requireString(card.collectorNumber, `${label}.collectorNumber`);
        return {
            ...card,
            referenceImagePath: resolveFixturePath(
                manifestDirectory,
                card.referenceImage,
                `${label}.referenceImage`
            )
        };
    });

    const cases = rawManifest.cases.map((fixture, index) => {
        const label = `cases[${index}]`;
        requireString(fixture.id, `${label}.id`);
        if (ids.has(fixture.id)) {
            throw new Error(`Duplicate regression case id: ${fixture.id}`);
        }
        ids.add(fixture.id);
        if (!QUALITY_LEVELS.includes(fixture.quality)) {
            throw new Error(`${label}.quality must be one of: ${QUALITY_LEVELS.join(", ")}`);
        }
        if (fixture.blocking !== undefined && typeof fixture.blocking !== "boolean") {
            throw new Error(`${label}.blocking must be a boolean`);
        }
        validateExpected(fixture.expected, label);
        return {
            ...fixture,
            imagePath: resolveFixturePath(manifestDirectory, fixture.image, `${label}.image`),
            transform: fixture.transform || {}
        };
    });

    return {
        ...rawManifest,
        path: manifestPath,
        directory: manifestDirectory,
        catalog,
        cases
    };
}

async function assertFixtureFilesExist(manifest) {
    const files = new Set([
        ...manifest.cases.map((fixture) => fixture.imagePath),
        ...manifest.catalog.map((card) => card.referenceImagePath)
    ]);
    await Promise.all(
        [...files].map(async (filePath) => {
            try {
                await access(filePath);
            } catch {
                throw new Error(`Regression fixture file does not exist: ${filePath}`);
            }
        })
    );
}

async function loadManifest(manifestPath) {
    const absolutePath = path.resolve(manifestPath);
    let rawManifest;
    try {
        rawManifest = JSON.parse(await readFile(absolutePath, "utf8"));
    } catch (err) {
        throw new Error(`Unable to read regression manifest ${absolutePath}: ${err.message}`);
    }
    const manifest = validateManifest(rawManifest, absolutePath);
    await assertFixtureFilesExist(manifest);
    return manifest;
}

export { QUALITY_LEVELS, assertFixtureFilesExist, loadManifest, validateManifest };

export default {
    QUALITY_LEVELS,
    assertFixtureFilesExist,
    loadManifest,
    validateManifest
};
