import Datastore from "@dills1220/nedb";
import _ from "lodash";
import { getConfig } from "../config/index.mjs";
import { resolveDbFilename } from "./resolve-db-path.mjs";

// Local (nedb) backend for the "real persistence" tier -- your actual card collection.
// Distinct from the always-on cache tier (names/hashes/ops-log): this only gets used when
// STORAGE_ADAPTER=nedb (the default), same as the rds backend does when STORAGE_ADAPTER=rds.

let dbInstance;

function getDbInstance() {
    if (!dbInstance) {
        dbInstance = new Datastore({
            filename: resolveDbFilename(getConfig().cardNamesDbPath, "collection.db"),
            autoload: true
        });
        dbInstance.ensureIndex({ fieldName: "lookupKey", unique: true });
    }
    return dbInstance;
}

function toLookupKey(cardName, cardSet) {
    return `${String(cardName || "").trim()}::${String(cardSet || "").trim()}`;
}

function GetQuantity(name, set, cb) {
    getDbInstance().findOne({ lookupKey: toLookupKey(name, set) }, (err, doc) => {
        if (err) {
            return cb(err, null);
        }
        return cb(null, (doc && doc.quantity) || 0);
    });
}

// Insert if new, increment quantity by `delta` (default 1) if the cardName+cardSet pair
// already exists -- "I scanned another copy" should add to the stack, not overwrite it.
//
// Note: this nedb fork doesn't support $setOnInsert, so we do an explicit find-then-branch
// instead of a single atomic upsert. There's a small race window on brand-new cards (two
// concurrent inserts could both see "not found"), but this app processes one scan per
// process invocation with no other locking anywhere else -- consistent with the existing
// concurrency model, not a new risk.
function Upsert(record, cb) {
    const { cardName, cardSet, delta = 1, priceUsd, ...rest } = record;
    const lookupKey = toLookupKey(cardName, cardSet);
    const db = getDbInstance();
    const now = new Date();

    db.findOne({ lookupKey }, (findErr, existing) => {
        if (findErr) {
            return cb(findErr, null);
        }

        const quantity = (existing ? existing.quantity || 0 : 0) + delta;
        // estValue tracks the whole stack's worth, not just the copy just added -- computed
        // here (not by the caller) since this is the one place that knows the final quantity.
        const estValue =
            typeof priceUsd === "number" ? _.round(priceUsd * quantity, 4) : rest.estValue;

        if (existing) {
            return db.update(
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
                {},
                (updateErr) => {
                    if (updateErr) {
                        return cb(updateErr, null);
                    }
                    return cb(null, { ...existing, ...rest, quantity, estValue, updatedAt: now });
                }
            );
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
        return db.insert(doc, (insertErr, inserted) => {
            if (insertErr) {
                return cb(insertErr, null);
            }
            return cb(null, inserted);
        });
    });
}

// Returns every collection entry -- used by the nedb->rds migration (src/migrate/) and
// anything else that needs the full local snapshot rather than a single lookup.
function GetAll(cb) {
    getDbInstance().find({}, (err, docs) => {
        if (err) {
            return cb(err, null);
        }
        return cb(null, docs || []);
    });
}

// Manual correction -- sets quantity to an exact value instead of adding to it (unlike
// Upsert, which is what scans call). Errors if the entry doesn't exist; use a scan (or
// Upsert directly) to create one. estValue is rescaled proportionally from the existing
// per-unit value when possible (we don't persist priceUsd itself, only the last computed
// estValue), otherwise left as-is rather than guessing.
function SetQuantity(name, set, quantity, cb) {
    const db = getDbInstance();
    const lookupKey = toLookupKey(name, set);

    db.findOne({ lookupKey }, (findErr, existing) => {
        if (findErr) {
            return cb(findErr, null);
        }
        if (!existing) {
            return cb(new Error(`No collection entry for "${name}" (${set})`), null);
        }

        const estValue =
            typeof existing.estValue === "number" && existing.quantity > 0
                ? _.round((existing.estValue / existing.quantity) * quantity, 4)
                : existing.estValue;
        const now = new Date();

        return db.update(
            { lookupKey },
            { $set: { quantity, estValue, updatedAt: now } },
            {},
            (updateErr) => {
                if (updateErr) {
                    return cb(updateErr, null);
                }
                return cb(null, { ...existing, quantity, estValue, updatedAt: now });
            }
        );
    });
}

// Deletes a collection entry outright. Returns the removed doc (or null if nothing matched)
// so callers can report what was actually removed.
function Remove(name, set, cb) {
    const db = getDbInstance();
    const lookupKey = toLookupKey(name, set);

    db.findOne({ lookupKey }, (findErr, existing) => {
        if (findErr) {
            return cb(findErr, null);
        }
        if (!existing) {
            return cb(null, null);
        }
        return db.remove({ lookupKey }, {}, (removeErr) => {
            if (removeErr) {
                return cb(removeErr, null);
            }
            return cb(null, existing);
        });
    });
}

export { GetQuantity, Upsert, GetAll, SetQuantity, Remove };

export default {
    GetQuantity,
    Upsert,
    GetAll,
    SetQuantity,
    Remove
};
