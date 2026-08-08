import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SCRYFALL_API_ORIGIN = "https://api.scryfall.com";
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
    if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
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
        )
    };
}

function buildCardSearchUrl(options) {
    const filters = ["game:paper", "lang:en"];
    if (options.setCodes.length > 0) {
        filters.push(`(${options.setCodes.map((setCode) => `e:${setCode}`).join(" OR ")})`);
    } else {
        if (options.releasedAfter) filters.push(`date>=${options.releasedAfter}`);
        if (options.releasedBefore) filters.push(`date<=${options.releasedBefore}`);
    }

    const url = new URL("/cards/search", SCRYFALL_API_ORIGIN);
    url.searchParams.set("q", filters.join(" "));
    url.searchParams.set("unique", "prints");
    url.searchParams.set("order", "released");
    url.searchParams.set("dir", "desc");
    return url.href;
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

function slugify(value) {
    const slug = String(value)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return slug || "card";
}

function imageUrlForCard(card) {
    const imageUrl = card?.image_uris?.normal;
    if (typeof imageUrl !== "string") return undefined;
    const parsed = new URL(imageUrl);
    if (
        parsed.protocol !== "https:" ||
        (parsed.hostname !== "img.scryfall.com" && !parsed.hostname.endsWith(".scryfall.io"))
    ) {
        return undefined;
    }
    return parsed.href;
}

function normalizeCard(card) {
    if (
        !card ||
        typeof card.id !== "string" ||
        typeof card.name !== "string" ||
        typeof card.set !== "string" ||
        typeof card.set_name !== "string" ||
        typeof card.collector_number !== "string" ||
        card.lang !== "en" ||
        card.digital === true
    ) {
        return undefined;
    }
    const imageUrl = imageUrlForCard(card);
    if (!imageUrl) return undefined;
    return {
        id: card.id,
        name: card.name,
        set: card.set.toUpperCase(),
        setName: card.set_name,
        collectorNumber: card.collector_number,
        typeLine: typeof card.type_line === "string" ? card.type_line : "Unknown",
        rarity: typeof card.rarity === "string" ? card.rarity : "unknown",
        apiUrl: typeof card.scryfall_uri === "string" ? card.scryfall_uri : card.uri,
        imageUrl
    };
}

function toManifestPath(manifestPath, filePath) {
    return path.relative(path.dirname(manifestPath), filePath).split(path.sep).join("/");
}

function fixtureEntries(card, manifestPath, imagePath, activate) {
    const relativeImage = toManifestPath(manifestPath, imagePath);
    const enabled = Boolean(activate);
    return {
        catalog: {
            enabled,
            scryfallId: card.id,
            name: card.name,
            set: card.set,
            setName: card.setName,
            collectorNumber: card.collectorNumber,
            typeLine: card.typeLine,
            rarity: card.rarity,
            referenceImage: relativeImage,
            apiUrl: card.apiUrl
        },
        fixture: {
            enabled,
            id: `${slugify(card.set)}-${slugify(card.collectorNumber)}-${slugify(card.name)}-${slugify(card.id.slice(0, 8))}-scryfall`,
            image: relativeImage,
            quality: "clean-scan",
            notes: enabled
                ? "Imported from Scryfall as an active clean-scan fixture"
                : "Imported from Scryfall; review OCR output and thresholds before enabling",
            expected: {
                name: card.name,
                set: card.set,
                collectorNumber: card.collectorNumber,
                metadata: {
                    typeLine: card.typeLine,
                    rarity: card.rarity
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
    const cards = await fetchCardPages(buildCardSearchUrl(selection), {
        maxPages: selection.maxPages
    });
    const selected = [];
    const selectedIdentities = new Set();
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
                (identity) => existing.has(identity) || selectedIdentities.has(identity)
            )
        ) {
            excludedExisting += 1;
            continue;
        }
        selected.push(card);
        for (const identity of identities) selectedIdentities.add(identity);
        if (selected.length === selection.count) break;
    }

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
        collectorNumber: card.collectorNumber
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
            const entries = fixtureEntries(
                item.card,
                manifestPath,
                item.finalImage,
                options.activate
            );
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
    fetchCardPages: async () => {
        throw new Error("Scryfall page fetching is not implemented");
    },
    downloadImage: async () => {
        throw new Error("Scryfall image downloading is not implemented");
    }
};

export {
    buildCardSearchUrl,
    importScryfallFixtures,
    manifestPrintIdentities,
    normalizeCard,
    normalizeImportOptions,
    normalizeSetCodes,
    printIdentities,
    readManifestJson
};
