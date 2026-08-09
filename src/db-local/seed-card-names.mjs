import { normalizeForMatch } from "../fuzzy-matching/name-index.mjs";

const DEFAULT_CONCURRENCY = 8;
const MAX_CONCURRENCY = 32;

async function seedCardNames({
    getCardNames,
    getStoredNames,
    upsertName,
    removeName,
    logger = console,
    concurrency = DEFAULT_CONCURRENCY
}) {
    const rawNames = await getCardNames();
    if (!Array.isArray(rawNames)) {
        throw new Error("Scryfall card-name response must be an array");
    }
    const catalog = prepareCatalog(rawNames);
    if (catalog.namesByNormalized.size === 0) {
        throw new Error("Scryfall card-name catalog contains no matchable names");
    }

    const storedNames = await getStoredNames();
    if (!Array.isArray(storedNames)) {
        throw new Error("Stored card-name response must be an array");
    }
    const stored = prepareStoredRecords(storedNames);

    logger.log(
        `Seeding ${catalog.namesByNormalized.size} matchable card names (${catalog.rejected} rejected, ${catalog.duplicates} duplicate catalog entries)...`
    );

    await runBounded(stored.recordsToRemove, concurrency, removeName);

    const writes = [];
    for (const [normalizedName, existingRecord] of stored.recordByNormalized) {
        if (!catalog.namesByNormalized.has(normalizedName)) {
            const name = existingRecord.name.trim();
            if (existingRecord.name !== name || existingRecord.normalizedName !== normalizedName) {
                writes.push({ name, normalizedName, existingRecord, kind: "updated" });
            }
        }
    }
    for (const [normalizedName, name] of catalog.namesByNormalized) {
        const existingRecord = stored.recordByNormalized.get(normalizedName);
        if (!existingRecord) {
            writes.push({ name, normalizedName, kind: "inserted" });
        } else if (
            existingRecord.name !== name ||
            existingRecord.normalizedName !== normalizedName
        ) {
            writes.push({ name, normalizedName, existingRecord, kind: "updated" });
        }
    }
    await runBounded(writes, concurrency, upsertName);

    const inserted = writes.filter((write) => write.kind === "inserted").length;
    const updated = writes.length - inserted;
    const result = {
        fetched: rawNames.length,
        accepted: catalog.namesByNormalized.size,
        rejected: catalog.rejected,
        catalogDuplicates: catalog.duplicates,
        inserted,
        updated,
        removed: stored.recordsToRemove.length,
        unchanged: stored.recordByNormalized.size - updated
    };
    logger.log(
        `Card-name seed complete: ${inserted} inserted, ${updated} updated, ${result.removed} invalid/duplicate rows removed, ${result.unchanged} unchanged.`
    );
    return result;
}

function prepareCatalog(names) {
    const namesByNormalized = new Map();
    let rejected = 0;
    let duplicates = 0;
    for (const value of names) {
        const normalizedName = typeof value === "string" ? normalizeForMatch(value) : "";
        if (!normalizedName) {
            rejected += 1;
            continue;
        }
        if (namesByNormalized.has(normalizedName)) {
            duplicates += 1;
            continue;
        }
        namesByNormalized.set(normalizedName, value.trim());
    }
    return { namesByNormalized, rejected, duplicates };
}

function prepareStoredRecords(records) {
    const recordByNormalized = new Map();
    const recordsToRemove = [];
    for (const record of records) {
        const normalizedName =
            typeof record?.name === "string" ? normalizeForMatch(record.name) : "";
        if (!normalizedName || recordByNormalized.has(normalizedName)) {
            recordsToRemove.push(record);
            continue;
        }
        recordByNormalized.set(normalizedName, record);
    }
    return { recordByNormalized, recordsToRemove };
}

async function runBounded(items, concurrency, operation) {
    if (items.length === 0) return;
    const workerCount = Math.min(items.length, normalizeConcurrency(concurrency));
    let nextIndex = 0;
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            await operation(items[index]);
        }
    });
    await Promise.all(workers);
}

function normalizeConcurrency(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return DEFAULT_CONCURRENCY;
    }
    return Math.min(parsed, MAX_CONCURRENCY);
}

export { prepareCatalog, prepareStoredRecords, seedCardNames };

export default seedCardNames;
