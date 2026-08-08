import { promisify } from "node:util";
import storageFactory from "./create-storage.mjs";
import { getConfig } from "../config/index.mjs";
import { db as namesDb } from "../db-local/db.mjs";
import cardHashCache from "../db-local/card-hash-cache.mjs";
import opsLog from "../db-local/ops-log.mjs";

// Two distinct tiers, deliberately not the same concept:
//
// 1. Cache tier (this module, names/hashes/log) -- always on by default, NOT selected by
//    STORAGE_ADAPTER. Always local nedb. Turned off entirely with --no-local-cache /
//    LOCAL_CACHE_ENABLED=false. Its job is speed (avoid re-querying Scryfall, avoid
//    re-extracting known hashes) and local diagnostics (the ops log), not being a source
//    of truth.
// 2. Persistence tier (getAdapter() below) -- selected by STORAGE_ADAPTER (nedb|rds). This
//    is where your actual collection and needs-attention records live. See
//    storage/adapters/*.
//
// Resolved lazily on first real use, not at import time. Consumers (match-name.mjs,
// process-hashes.mjs, back-filler.mjs) grab storage.names.getAll / storage.hashes.* at their
// own module-load time, so the wrapper functions below -- not just this module -- need to
// defer adapter creation until actually invoked. Otherwise config sourced from CLI flags
// (applied to process.env by index.mjs before the pipeline runs) never takes effect, since
// it's set after every module in the import graph has already loaded.
let adapterInstance;

function getAdapter() {
    if (!adapterInstance) {
        adapterInstance = storageFactory.createStorage();
    }
    return adapterInstance;
}

function cacheEnabled() {
    return getConfig().localCacheEnabled;
}

async function getAllNames() {
    const docs = await promisify(namesDb.find)({});
    return docs || [];
}

async function getHashesByCardName(cardName) {
    if (!cacheEnabled()) {
        return [];
    }
    const docs = await promisify(cardHashCache.GetHashes)(cardName);
    return docs || [];
}

function upsertHash(record) {
    if (!cacheEnabled()) {
        return;
    }
    cardHashCache.InsertEntity(record);
}

function logOperation(entry) {
    if (!cacheEnabled()) {
        return;
    }
    opsLog.LogOperation(entry);
}

const storage = {
    get adapterName() {
        return getAdapter().adapterName;
    },
    // Cache tier -- always local nedb, not adapter-selectable. Names are a required local
    // index for matching to function at all (no remote alternative exists), so unlike hashes
    // and the ops log, --no-local-cache does not affect name lookups.
    names: {
        getAll: getAllNames
    },
    hashes: {
        getByCardName: getHashesByCardName,
        upsert: upsertHash
    },
    log: {
        record: logOperation,
        dump: promisify(opsLog.GetOperations),
        stats: promisify(opsLog.GetStats)
    },
    // Persistence tier -- STORAGE_ADAPTER-selected (nedb | rds).
    collection: {
        getQuantity: (...args) => getAdapter().collection.getQuantity(...args),
        upsert: (...args) => getAdapter().collection.upsert(...args),
        setQuantity: (...args) => getAdapter().collection.setQuantity(...args),
        remove: (...args) => getAdapter().collection.remove(...args)
    },
    needsAttention: {
        insert: (...args) => getAdapter().needsAttention.insert(...args)
    }
};

export { storage };

export default storage;
