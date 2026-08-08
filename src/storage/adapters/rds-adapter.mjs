import rds from "../../rds/index.mjs";

// "Real persistence" tier, MySQL-backed (opt-in via STORAGE_ADAPTER=rds). Names/hashes/ops-log
// stay on the always-on local nedb cache regardless of this setting (see storage/index.mjs) --
// this adapter previously faked a "names" implementation by silently reading the local nedb
// file, which was misleading; that's gone now that names aren't adapter-selectable at all.

function getQuantity(name, set) {
    return new Promise((resolve, reject) => {
        rds.Collection.GetQuantity(name, set, (err, quantity) => {
            if (err) {
                return reject(err);
            }
            return resolve(quantity);
        });
    });
}

function upsertCollection(record) {
    return new Promise((resolve, reject) => {
        rds.Collection.UpsertRecord(record, (err, results) => {
            if (err) {
                return reject(err);
            }
            return resolve(results);
        });
    });
}

function setQuantity(name, set, quantity) {
    return new Promise((resolve, reject) => {
        rds.Collection.SetQuantity(name, set, quantity, (err, results) => {
            if (err) {
                return reject(err);
            }
            return resolve(results);
        });
    });
}

function removeCollection(name, set) {
    return new Promise((resolve, reject) => {
        rds.Collection.DeleteRecord(name, set, (err, results) => {
            if (err) {
                return reject(err);
            }
            return resolve(results);
        });
    });
}

function insertNeedsAttention(record) {
    return new Promise((resolve, reject) => {
        rds.NDAttn.InsertRecord(record, (err, results) => {
            if (err) {
                return reject(err);
            }
            return resolve(results);
        });
    });
}

function createRdsAdapter() {
    return {
        adapterName: "rds",
        collection: {
            getQuantity,
            upsert: upsertCollection,
            setQuantity,
            remove: removeCollection
        },
        needsAttention: {
            insert: insertNeedsAttention
        }
    };
}

export { createRdsAdapter };

export default {
    createRdsAdapter
};
