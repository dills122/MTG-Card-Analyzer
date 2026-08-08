import collectionStore from "../db-local/collection-store.mjs";
import needsAttentionStore from "../db-local/needs-attention-store.mjs";
import rds from "../rds/index.mjs";

// One-shot migration: local nedb (collection + needs-attention) -> MySQL (rds adapter).
// Always reads from local nedb and always writes to rds, independent of whatever
// STORAGE_ADAPTER is currently selected -- the direction is fixed, this isn't a general sync.
//
// Idempotent by default: an entry already present on the target (quantity > 0 for
// collection, a unique-constraint hit for needs-attention) is skipped rather than
// double-counted. --force re-migrates collection entries anyway (adds local quantity on
// top of whatever's already there); needs-attention has no meaningful "force" since there's
// no quantity to add, just the same row again -- which the unique constraint already
// rejects.

async function migrateCollection({ dryRun = false, force = false } = {}) {
    const localEntries = await collectionStore.getAll();

    const results = { total: localEntries.length, migrated: 0, skipped: 0, errors: [] };

    for (const entry of localEntries) {
        try {
            const existingQty = await rds.collection.getQuantity(entry.cardName, entry.cardSet);

            if (existingQty > 0 && !force) {
                results.skipped += 1;
                continue;
            }

            if (!dryRun) {
                await rds.collection.upsertRecord({
                    cardName: entry.cardName,
                    cardType: entry.cardType,
                    cardSet: entry.cardSet,
                    delta: entry.quantity,
                    estValue: entry.estValue,
                    automated: entry.automated,
                    magicId: entry.magicId,
                    imageUrl: entry.imageUrl
                });
            }
            results.migrated += 1;
        } catch (err) {
            results.errors.push({
                cardName: entry.cardName,
                cardSet: entry.cardSet,
                error: err.message || String(err)
            });
        }
    }

    return results;
}

async function migrateNeedsAttention({ dryRun = false } = {}) {
    const localEntries = await needsAttentionStore.getAll();

    const results = { total: localEntries.length, migrated: 0, skipped: 0, errors: [] };

    for (const entry of localEntries) {
        if (dryRun) {
            results.migrated += 1;
            continue;
        }
        try {
            await rds.needsAttention.insertRecord({
                cardName: entry.cardName,
                possibleSets: entry.possibleSets,
                extractedText: entry.extractedText,
                dirtyExtractedText: entry.dirtyExtractedText,
                nameImage: entry.nameImage
            });
            results.migrated += 1;
        } catch (err) {
            // A unique-constraint hit (CardName+ExtractedText+NameImage) means this row was
            // already migrated in a previous run -- expected on rerun, not a real failure.
            if (err.code === "ER_DUP_ENTRY") {
                results.skipped += 1;
            } else {
                results.errors.push({
                    cardName: entry.cardName,
                    error: err.message || String(err)
                });
            }
        }
    }

    return results;
}

async function migrateNedbToRds(options = {}) {
    const collection = await migrateCollection(options);
    const needsAttention = await migrateNeedsAttention(options);
    return { collection, needsAttention };
}

export { migrateNedbToRds, migrateCollection, migrateNeedsAttention };

export default {
    migrateNedbToRds,
    migrateCollection,
    migrateNeedsAttention
};
