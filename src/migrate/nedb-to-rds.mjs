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
    const localEntries = await new Promise((resolve, reject) => {
        collectionStore.GetAll((err, docs) => (err ? reject(err) : resolve(docs)));
    });

    const results = { total: localEntries.length, migrated: 0, skipped: 0, errors: [] };

    for (const entry of localEntries) {
        try {
            const existingQty = await new Promise((resolve, reject) => {
                rds.Collection.GetQuantity(entry.cardName, entry.cardSet, (err, qty) =>
                    err ? reject(err) : resolve(qty)
                );
            });

            if (existingQty > 0 && !force) {
                results.skipped += 1;
                continue;
            }

            if (!dryRun) {
                await new Promise((resolve, reject) => {
                    rds.Collection.UpsertRecord(
                        {
                            cardName: entry.cardName,
                            cardType: entry.cardType,
                            cardSet: entry.cardSet,
                            delta: entry.quantity,
                            estValue: entry.estValue,
                            automated: entry.automated,
                            magicId: entry.magicId,
                            imageUrl: entry.imageUrl
                        },
                        (err) => (err ? reject(err) : resolve())
                    );
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
    const localEntries = await new Promise((resolve, reject) => {
        needsAttentionStore.GetAll((err, docs) => (err ? reject(err) : resolve(docs)));
    });

    const results = { total: localEntries.length, migrated: 0, skipped: 0, errors: [] };

    for (const entry of localEntries) {
        if (dryRun) {
            results.migrated += 1;
            continue;
        }
        try {
            await new Promise((resolve, reject) => {
                rds.NDAttn.InsertRecord(
                    {
                        cardName: entry.cardName,
                        possibleSets: entry.possibleSets,
                        extractedText: entry.extractedText,
                        dirtyExtractedText: entry.dirtyExtractedText,
                        nameImage: entry.nameImage
                    },
                    (err) => (err ? reject(err) : resolve())
                );
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
