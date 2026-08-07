import collectionStore from "../../db-local/collection-store.mjs";
import needsAttentionStore from "../../db-local/needs-attention-store.mjs";

// "Real persistence" tier, nedb-backed. Names/hashes/ops-log live in the always-on cache
// tier (see src/storage/index.mjs) and are not part of this adapter -- this adapter is only
// for the data STORAGE_ADAPTER is actually meant to select a backend for: your collection
// and needs-attention records.

function getQuantity(name, set) {
    return new Promise((resolve, reject) => {
        collectionStore.GetQuantity(name, set, (err, quantity) => {
            if (err) {
                return reject(err);
            }
            return resolve(quantity);
        });
    });
}

function upsertCollection(record) {
    return new Promise((resolve, reject) => {
        collectionStore.Upsert(record, (err, doc) => {
            if (err) {
                return reject(err);
            }
            return resolve(doc);
        });
    });
}

function insertNeedsAttention(record) {
    return new Promise((resolve, reject) => {
        needsAttentionStore.Insert(record, (err, doc) => {
            if (err) {
                return reject(err);
            }
            return resolve(doc);
        });
    });
}

function createNedbAdapter() {
    return {
        adapterName: "nedb",
        collection: {
            getQuantity,
            upsert: upsertCollection
        },
        needsAttention: {
            insert: insertNeedsAttention
        }
    };
}

export { createNedbAdapter };

export default {
    createNedbAdapter
};
