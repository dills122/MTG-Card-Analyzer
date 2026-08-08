import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    buildCardSearchUrl,
    downloadImage,
    fetchCardPages,
    imageUrlForCard
} from "../scryfall-api/regression-fixtures.mjs";
import { cardCoverage, selectBalancedCards } from "./balanced-card-selector.mjs";

const DEFAULT_MAX_PAGES = 20;
const MAX_COUNT = 100;
const MAX_PAGES = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SET_CODE_PATTERN = /^[a-z0-9]{2,6}$/i;

function parsePositiveInteger(value, label, maximum) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
        throw new Error(`${label} must be an integer from 1 to ${maximum}`);
    }
    return number;
}

function normalizeSetCodes(values = []) {
    const setCodes = values
        .flatMap((value) => String(value).split(","))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    for (const setCode of setCodes) {
        if (!SET_CODE_PATTERN.test(setCode)) {
            throw new Error(`Invalid Scryfall set code: ${setCode}`);
        }
    }
    return [...new Set(setCodes)].sort();
}

function validateDate(value, label) {
    if (value === undefined) return undefined;
    if (!DATE_PATTERN.test(value)) {
        throw new Error(`${label} must use YYYY-MM-DD`);
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error(`${label} must use YYYY-MM-DD`);
    }
    return value;
}

function normalizeImportOptions(options) {
    const setCodes = normalizeSetCodes(options.sets);
    const releasedAfter = validateDate(options.releasedAfter, "released-after");
    const releasedBefore = validateDate(options.releasedBefore, "released-before");
    const hasDates = Boolean(releasedAfter || releasedBefore);

    if (setCodes.length > 0 && hasDates) {
        throw new Error("Choose set codes or a release-date range, not both");
    }
    if (setCodes.length === 0 && !hasDates) {
        throw new Error("Provide --sets or at least one release-date bound");
    }
    if (releasedAfter && releasedBefore && releasedAfter > releasedBefore) {
        throw new Error("released-after must be on or before released-before");
    }

    return {
        setCodes,
        releasedAfter,
        releasedBefore,
        count: parsePositiveInteger(options.count, "count", MAX_COUNT),
        maxPages: parsePositiveInteger(
            options.maxPages ?? DEFAULT_MAX_PAGES,
            "max-pages",
            MAX_PAGES
        ),
        balanced: options.balanced === true
    };
}

async function readManifestJson(manifestPath) {
    let manifest;
    try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
        throw new Error(`Unable to read fixture manifest ${manifestPath}`, { cause: error });
    }
    if (!manifest || !Array.isArray(manifest.catalog) || !Array.isArray(manifest.cases)) {
        throw new Error(`Fixture manifest must contain catalog and cases arrays: ${manifestPath}`);
    }
    return manifest;
}

function printIdentities(card) {
    const identities = [];
    const scryfallId = card.scryfallId || card.id;
    if (scryfallId) identities.push(`id:${String(scryfallId).toLowerCase()}`);
    const set = card.set;
    const collectorNumber = card.collectorNumber || card.collector_number;
    if (set && collectorNumber) {
        identities.push(
            `print:${String(set).toLowerCase()}/${String(collectorNumber).toLowerCase()}`
        );
    }
    return identities;
}

function manifestPrintIdentities(manifest) {
    return new Set(manifest.catalog.flatMap(printIdentities));
}

function hasEnoughNewPrintableCards(cards, existing, count) {
    const selected = new Set();
    let total = 0;
    for (const rawCard of cards) {
        const card = normalizeCard(rawCard);
        if (!card) continue;
        const identities = printIdentities(card);
        if (identities.some((identity) => existing.has(identity) || selected.has(identity))) {
            continue;
        }
        for (const identity of identities) selected.add(identity);
        total += 1;
        if (total === count) return true;
    }
    return false;
}

function slugify(value) {
    const slug = String(value)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return slug || "card";
}

function normalizeCard(card) {
    const requiredStrings = [
        card?.id,
        card?.name,
        card?.set,
        card?.set_name,
        card?.collector_number
    ];
    if (
        !card ||
        requiredStrings.some((value) => typeof value !== "string" || value.trim().length === 0) ||
        card.lang !== "en" ||
        card.digital !== false
    ) {
        return undefined;
    }
    const imageUrl = imageUrlForCard(card);
    if (!imageUrl) return undefined;
    const coverage = cardCoverage(card);
    return {
        id: card.id,
        name: card.name,
        set: card.set.toUpperCase(),
        setName: card.set_name,
        collectorNumber: card.collector_number,
        ...coverage,
        rarity: typeof card.rarity === "string" ? card.rarity : "unknown",
        apiUrl: typeof card.scryfall_uri === "string" ? card.scryfall_uri : card.uri,
        imageUrl
    };
}

function toManifestPath(manifestPath, filePath) {
    return path.relative(path.dirname(manifestPath), filePath).split(path.sep).join("/");
}

function fixtureEntries(card, manifestPath, imagePath) {
    const relativeImage = toManifestPath(manifestPath, imagePath);
    return {
        catalog: {
            enabled: false,
            scryfallId: card.id,
            name: card.name,
            set: card.set,
            setName: card.setName,
            collectorNumber: card.collectorNumber,
            typeLine: card.typeLine,
            rarity: card.rarity,
            colors: card.colors,
            layout: card.layout,
            style: card.style,
            referenceImage: relativeImage,
            apiUrl: card.apiUrl
        },
        fixture: {
            enabled: false,
            id: `${slugify(card.set)}-${slugify(card.collectorNumber)}-${slugify(card.name)}-${slugify(card.id.slice(0, 8))}-scryfall`,
            image: relativeImage,
            quality: "clean-scan",
            notes: "Imported from Scryfall; review OCR output and thresholds before enabling",
            expected: {
                name: card.name,
                set: card.set,
                collectorNumber: card.collectorNumber,
                metadata: {
                    typeLine: card.typeLine,
                    rarity: card.rarity,
                    colors: card.colors,
                    layout: card.layout,
                    style: card.style
                },
                minNameScore: 0.7,
                maxPrintCandidates: 1,
                maxRuntimeMs: 30000
            }
        }
    };
}

async function fileExists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function writeManifestAtomically(manifestPath, manifest) {
    const temporaryPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;
    try {
        await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 4)}\n`, { flag: "wx" });
        await rename(temporaryPath, manifestPath);
    } finally {
        await rm(temporaryPath, { force: true });
    }
}

async function importScryfallFixtures(options, overrides = {}) {
    const selection = normalizeImportOptions(options);
    const manifestPath = path.resolve(options.manifestPath);
    const imageDirectory = path.resolve(options.imageDirectory);
    const manifest = await readManifestJson(manifestPath);
    const extraManifests = await Promise.all(
        (options.existingManifestPaths || []).map((existingPath) =>
            readManifestJson(path.resolve(existingPath))
        )
    );
    const existing = manifestPrintIdentities(manifest);
    for (const extraManifest of extraManifests) {
        for (const identity of manifestPrintIdentities(extraManifest)) existing.add(identity);
    }

    const fetchCardPages = overrides.fetchCardPages || defaultDependencies.fetchCardPages;
    const fetchOptions = { maxPages: selection.maxPages };
    if (!selection.balanced) {
        fetchOptions.shouldStop = (collectedCards) =>
            hasEnoughNewPrintableCards(collectedCards, existing, selection.count);
    }
    const cards = await fetchCardPages(buildCardSearchUrl(selection), fetchOptions);
    const candidates = [];
    const candidateIdentities = new Set();
    let excludedExisting = 0;
    let skippedUnprintable = 0;

    for (const rawCard of cards) {
        const card = normalizeCard(rawCard);
        if (!card) {
            skippedUnprintable += 1;
            continue;
        }
        const identities = printIdentities(card);
        if (
            identities.some(
                (identity) => existing.has(identity) || candidateIdentities.has(identity)
            )
        ) {
            excludedExisting += 1;
            continue;
        }
        candidates.push(card);
        for (const identity of identities) candidateIdentities.add(identity);
        if (!selection.balanced && candidates.length === selection.count) break;
    }

    const selected = selection.balanced
        ? selectBalancedCards(candidates, selection.count)
        : candidates.slice(0, selection.count);

    if (selected.length < selection.count) {
        throw new Error(
            `Found ${selected.length} new printable cards; requested ${selection.count}. ` +
                "Increase --max-pages or widen selection."
        );
    }

    const added = selected.map((card) => ({
        scryfallId: card.id,
        name: card.name,
        set: card.set,
        collectorNumber: card.collectorNumber,
        colors: card.colors,
        colorCategory: card.colorCategory,
        primaryType: card.primaryType,
        layout: card.layout,
        style: card.style,
        rarity: card.rarity
    }));
    if (options.dryRun) {
        return { added, excludedExisting, skippedUnprintable, dryRun: true };
    }

    await mkdir(path.dirname(imageDirectory), { recursive: true });
    await mkdir(imageDirectory, { recursive: true });
    const temporaryDirectory = await mkdtemp(path.join(path.dirname(imageDirectory), ".import-"));
    const movedImages = [];
    try {
        const prepared = [];
        for (const card of selected) {
            const filename = `${slugify(card.set)}-${slugify(card.collectorNumber)}-${slugify(card.name)}-${slugify(card.id.slice(0, 8))}.jpg`;
            const temporaryImage = path.join(temporaryDirectory, filename);
            const finalImage = path.join(imageDirectory, filename);
            if (await fileExists(finalImage)) {
                throw new Error(`Fixture image already exists: ${finalImage}`);
            }
            await (overrides.downloadImage || defaultDependencies.downloadImage)(
                card.imageUrl,
                temporaryImage
            );
            prepared.push({ card, temporaryImage, finalImage });
        }

        for (const item of prepared) {
            await rename(item.temporaryImage, item.finalImage);
            movedImages.push(item.finalImage);
            const entries = fixtureEntries(item.card, manifestPath, item.finalImage);
            manifest.catalog.push(entries.catalog);
            manifest.cases.push(entries.fixture);
        }
        await writeManifestAtomically(manifestPath, manifest);
    } catch (error) {
        await Promise.all(movedImages.map((imagePath) => rm(imagePath, { force: true })));
        throw error;
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }

    return { added, excludedExisting, skippedUnprintable, dryRun: false };
}

const defaultDependencies = {
    fetchCardPages,
    downloadImage
};

export {
    importScryfallFixtures,
    manifestPrintIdentities,
    normalizeCard,
    normalizeImportOptions,
    normalizeSetCodes,
    printIdentities,
    readManifestJson
};
