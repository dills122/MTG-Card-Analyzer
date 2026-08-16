import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    buildCardSearchUrl,
    downloadImage,
    fetchCardPages,
    fetchResultCount,
    imageUrlForCard
} from "../scryfall-api/regression-fixtures.mjs";
import { cardCoverage, selectBalancedCards } from "./balanced-card-selector.mjs";

const DEFAULT_MAX_PAGES = 20;
const MAX_COUNT = 100;
const MAX_PAGES = 100;
const MAX_SEED = 2 ** 32 - 1;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SET_CODE_PATTERN = /^[a-z0-9]{2,6}$/i;
const LAYOUT_PATTERN = /^[a-z][a-z0-9_]*$/;
const IMPORT_STYLES = ["full-art", "borderless", "showcase", "extended-art", "textless"];
const IMPORT_FACES = ["front", "back"];

// mulberry32: small, fast, seedable PRNG. Not cryptographic; only used to pick a
// random Scryfall result page and shuffle candidates so repeated imports over the
// same wide query stop landing on the same set every time.
function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function createRng(seed) {
    return seed === undefined ? Math.random : mulberry32(seed);
}

function shuffle(items, rng) {
    const shuffled = items.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

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

function normalizeLayouts(values = []) {
    const layouts = values
        .flatMap((value) => String(value).split(","))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    for (const layout of layouts) {
        if (!LAYOUT_PATTERN.test(layout)) {
            throw new Error(`Invalid Scryfall layout: ${layout}`);
        }
    }
    return [...new Set(layouts)].sort();
}

function normalizeStyles(values = []) {
    const styles = values
        .flatMap((value) => String(value).split(","))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    for (const style of styles) {
        if (!IMPORT_STYLES.includes(style)) {
            throw new Error(
                `Invalid Scryfall style: ${style}. Expected one of: ${IMPORT_STYLES.join(", ")}`
            );
        }
    }
    return [...new Set(styles)].sort();
}

function validateSeed(value) {
    if (value === undefined) return undefined;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0 || number > MAX_SEED) {
        throw new Error(`seed must be an integer from 0 to ${MAX_SEED}`);
    }
    return number;
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
    const layouts = normalizeLayouts(options.layouts);
    const styles = normalizeStyles(options.styles);
    const face = String(options.face ?? "front")
        .trim()
        .toLowerCase();
    const releasedAfter = validateDate(options.releasedAfter, "released-after");
    const releasedBefore = validateDate(options.releasedBefore, "released-before");
    const hasDates = Boolean(releasedAfter || releasedBefore);

    if (setCodes.length > 0 && hasDates) {
        throw new Error("Choose set codes or a release-date range, not both");
    }
    if (setCodes.length === 0 && !hasDates && layouts.length === 0 && styles.length === 0) {
        throw new Error(
            "Provide --sets, a release-date bound, or at least one layout/style filter"
        );
    }
    if (releasedAfter && releasedBefore && releasedAfter > releasedBefore) {
        throw new Error("released-after must be on or before released-before");
    }
    if (!IMPORT_FACES.includes(face)) {
        throw new Error(`face must be one of: ${IMPORT_FACES.join(", ")}`);
    }

    return {
        setCodes,
        layouts,
        styles,
        releasedAfter,
        releasedBefore,
        count: parsePositiveInteger(options.count, "count", MAX_COUNT),
        maxPages: parsePositiveInteger(
            options.maxPages ?? DEFAULT_MAX_PAGES,
            "max-pages",
            MAX_PAGES
        ),
        balanced: options.balanced === true,
        face,
        seed: validateSeed(options.seed)
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

function hasEnoughNewPrintableCards(cards, existing, count, face = "front") {
    const selected = new Set();
    let total = 0;
    for (const rawCard of cards) {
        const card = normalizeCard(rawCard, face);
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

function normalizeCard(card, face = "front") {
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
    const imageUrl = imageUrlForCard(card, face);
    if (!imageUrl) return undefined;
    const selectedFace = card.card_faces?.[face === "back" ? 1 : 0];
    const coverage = cardCoverage({
        ...card,
        colors: card.colors ?? selectedFace?.colors,
        type_line: card.type_line ?? selectedFace?.type_line
    });
    return {
        id: card.id,
        name: card.name,
        set: card.set.toUpperCase(),
        setName: card.set_name,
        collectorNumber: card.collector_number,
        ...coverage,
        rarity: typeof card.rarity === "string" ? card.rarity : "unknown",
        face,
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
            face: card.face,
            referenceImage: relativeImage,
            apiUrl: card.apiUrl
        },
        fixture: {
            enabled: false,
            id: `${slugify(card.set)}-${slugify(card.collectorNumber)}-${slugify(
                card.name
            )}-${slugify(card.id.slice(0, 8))}${card.face === "back" ? "-back" : ""}-scryfall`,
            image: relativeImage,
            quality: "clean-scan",
            notes: "Imported from Scryfall; review OCR output and thresholds before enabling",
            expected: {
                name: card.name,
                set: card.set,
                collectorNumber: card.collectorNumber,
                scryfallId: card.id,
                metadata: {
                    typeLine: card.typeLine,
                    rarity: card.rarity,
                    colors: card.colors,
                    layout: card.layout,
                    style: card.style,
                    face: card.face
                },
                minNameScore: 0.7,
                maxPrintCandidates: 1,
                maxRuntimeMs: 35000
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
    const fetchResultCount = overrides.fetchResultCount || defaultDependencies.fetchResultCount;
    const rng = overrides.random || createRng(selection.seed);
    const searchUrl = buildCardSearchUrl(selection);

    // Scryfall always returns matches newest-first. A wide query (broad set list or
    // release-date range) has far more pages than maxPages ever walks, so starting at
    // page 1 every run returns the same newest set every time. Land on a random page
    // instead, then wrap back to page 1 if we run off the end before filling the budget.
    const { totalCards, pageSize } = await fetchResultCount(searchUrl, {
        fetchImpl: overrides.fetchImpl
    });
    const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalCards / pageSize)) : 1;
    const startPage = totalPages > 1 ? 1 + Math.floor(rng() * totalPages) : 1;

    const fetchOptions = {
        maxPages: selection.maxPages,
        startPage,
        fetchImpl: overrides.fetchImpl
    };
    if (!selection.balanced) {
        fetchOptions.shouldStop = (collectedCards) =>
            hasEnoughNewPrintableCards(collectedCards, existing, selection.count, selection.face);
    }
    let cards = await fetchCardPages(searchUrl, fetchOptions);

    const pagesUsed = pageSize > 0 ? Math.ceil(cards.length / pageSize) : cards.length > 0 ? 1 : 0;
    const ranOffTheEnd = startPage > 1 && startPage - 1 + pagesUsed >= totalPages;
    const budgetRemains = pagesUsed < selection.maxPages;
    const stillWant = selection.balanced
        ? budgetRemains
        : !hasEnoughNewPrintableCards(cards, existing, selection.count, selection.face);
    if (ranOffTheEnd && budgetRemains && stillWant) {
        const priorCards = cards;
        const wrapOptions = {
            maxPages: selection.maxPages - pagesUsed,
            startPage: 1,
            fetchImpl: overrides.fetchImpl
        };
        if (!selection.balanced) {
            wrapOptions.shouldStop = (collectedCards) =>
                hasEnoughNewPrintableCards(
                    [...priorCards, ...collectedCards],
                    existing,
                    selection.count,
                    selection.face
                );
        }
        const wrapped = await fetchCardPages(searchUrl, wrapOptions);
        cards = priorCards.concat(wrapped);
    }

    const candidates = [];
    const candidateIdentities = new Set();
    let excludedExisting = 0;
    let skippedUnprintable = 0;

    for (const rawCard of cards) {
        const card = normalizeCard(rawCard, selection.face);
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

    const shuffledCandidates = shuffle(candidates, rng);
    const selected = selection.balanced
        ? selectBalancedCards(shuffledCandidates, selection.count)
        : shuffledCandidates.slice(0, selection.count);

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
        face: card.face,
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
            const filename = `${slugify(card.set)}-${slugify(card.collectorNumber)}-${slugify(
                card.name
            )}-${slugify(card.id.slice(0, 8))}${card.face === "back" ? "-back" : ""}.jpg`;
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
    fetchResultCount,
    downloadImage
};

export {
    importScryfallFixtures,
    manifestPrintIdentities,
    normalizeCard,
    normalizeImportOptions,
    normalizeLayouts,
    normalizeSetCodes,
    normalizeStyles,
    printIdentities,
    readManifestJson
};
