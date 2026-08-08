import { getConfig } from "../config/index.mjs";
import { resolveDbFilename } from "./resolve-db-path.mjs";
import { round } from "../util.mjs";
import { createNedbStore } from "./create-nedb-store.mjs";

// Local (nedb) backend for the "real persistence" tier -- your actual card collection.
// Distinct from the always-on cache tier (names/hashes/ops-log): this only gets used when
// STORAGE_ADAPTER=nedb (the default), same as the rds backend does when STORAGE_ADAPTER=rds.

const { find, findOne, insert, update, remove } = createNedbStore({
    resolveFilename: () => resolveDbFilename(getConfig().cardNamesDbPath, "collection.db"),
    indexes: [{ fieldName: "lookupKey", unique: true }]
});

function toLookupKey(cardName, cardSet) {
    return `${String(cardName || "").trim()}::${String(cardSet || "").trim()}`;
}

async function getQuantity(name, set) {
    const doc = await findOne({ lookupKey: toLookupKey(name, set) });
    return (doc && doc.quantity) || 0;
}

// Insert if new, increment quantity by `delta` (default 1) if the cardName+cardSet pair
// already exists -- "I scanned another copy" should add to the stack, not overwrite it.
//
// Note: this nedb fork doesn't support $setOnInsert, so we do an explicit find-then-branch
// instead of a single atomic upsert. There's a small race window on brand-new cards (two
// concurrent inserts could both see "not found"), but this app processes one scan per
// process invocation with no other locking anywhere else -- consistent with the existing
// concurrency model, not a new risk.
async function upsert(record) {
    const { cardName, cardSet, delta = 1, priceUsd, ...rest } = record;
    const lookupKey = toLookupKey(cardName, cardSet);
    const now = new Date();

    const existing = await findOne({ lookupKey });

    const quantity = (existing ? existing.quantity || 0 : 0) + delta;
    // estValue tracks the whole stack's worth, not just the copy just added -- computed
    // here (not by the caller) since this is the one place that knows the final quantity.
    const estValue = typeof priceUsd === "number" ? round(priceUsd * quantity, 4) : rest.estValue;

    if (existing) {
        await update(
            { lookupKey },
            {
                $set: {
                    ...rest,
                    cardName,
                    cardSet,
                    lookupKey,
                    quantity,
                    estValue,
                    updatedAt: now
                }
            },
            {}
        );
        return { ...existing, ...rest, quantity, estValue, updatedAt: now };
    }

    const doc = {
        ...rest,
        cardName,
        cardSet,
        lookupKey,
        quantity,
        estValue,
        createdAt: now,
        updatedAt: now
    };
    return insert(doc);
}

// Returns every collection entry -- used by the nedb->rds migration (src/migrate/) and
// anything else that needs the full local snapshot rather than a single lookup.
async function getAll() {
    const docs = await find({});
    return docs || [];
}

// Manual correction -- sets quantity to an exact value instead of adding to it (unlike
// upsert, which is what scans call). Errors if the entry doesn't exist; use a scan (or
// upsert directly) to create one. estValue is rescaled proportionally from the existing
// per-unit value when possible (we don't persist priceUsd itself, only the last computed
// estValue), otherwise left as-is rather than guessing.
async function setQuantity(name, set, quantity) {
    const lookupKey = toLookupKey(name, set);
    const existing = await findOne({ lookupKey });
    if (!existing) {
        throw new Error(`No collection entry for "${name}" (${set})`);
    }

    const estValue =
        typeof existing.estValue === "number" && existing.quantity > 0
            ? round((existing.estValue / existing.quantity) * quantity, 4)
            : existing.estValue;
    const now = new Date();

    await update({ lookupKey }, { $set: { quantity, estValue, updatedAt: now } }, {});
    return { ...existing, quantity, estValue, updatedAt: now };
}

// Deletes a collection entry outright. Returns the removed doc (or null if nothing matched)
// so callers can report what was actually removed.
async function remove_(name, set) {
    const lookupKey = toLookupKey(name, set);
    const existing = await findOne({ lookupKey });
    if (!existing) {
        return null;
    }
    await remove({ lookupKey }, {});
    return existing;
}

export { getQuantity, upsert, getAll, setQuantity, remove_ as remove };

export default {
    getQuantity,
    upsert,
    getAll,
    setQuantity,
    remove: remove_
};
