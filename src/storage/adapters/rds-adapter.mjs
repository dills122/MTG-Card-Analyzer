import rds from "../../rds/index.mjs";

// "Real persistence" tier, MySQL-backed (opt-in via STORAGE_ADAPTER=rds). Names/hashes/ops-log
// stay on the always-on local nedb cache regardless of this setting (see storage/index.mjs) --
// this adapter previously faked a "names" implementation by silently reading the local nedb
// file, which was misleading; that's gone now that names aren't adapter-selectable at all.
//
// rds/collection.mjs and rds/needs-attention.mjs are natively promise-based now, so this is
// just a plain object mapping adapter method names to rds method names -- no promisify
// wrapping step needed. See nedb-adapter.mjs for why methods are still called by lookup
// (`(...args) => rds.collection.getQuantity(...args)`) rather than a captured reference.

function createRdsAdapter() {
    return {
        adapterName: "rds",
        collection: {
            getQuantity: (...args) => rds.collection.getQuantity(...args),
            upsert: (...args) => rds.collection.upsertRecord(...args),
            setQuantity: (...args) => rds.collection.setQuantity(...args),
            remove: (...args) => rds.collection.deleteRecord(...args)
        },
        needsAttention: {
            insert: (...args) => rds.needsAttention.insertRecord(...args)
        }
    };
}

export { createRdsAdapter };

export default {
    createRdsAdapter
};
