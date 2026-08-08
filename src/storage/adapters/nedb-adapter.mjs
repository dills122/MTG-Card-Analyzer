import collectionStore from "../../db-local/collection-store.mjs";
import needsAttentionStore from "../../db-local/needs-attention-store.mjs";

// "Real persistence" tier, nedb-backed. Names/hashes/ops-log live in the always-on cache
// tier (see src/storage/index.mjs) and are not part of this adapter -- this adapter is only
// for the data STORAGE_ADAPTER is actually meant to select a backend for: your collection
// and needs-attention records.
//
// Both store modules are natively promise-based now, so this is just a plain object mapping
// adapter method names to store method names -- no promisify wrapping step needed. Methods
// are still called by looking them up on the store object at call time (`(...args) =>
// collectionStore.getQuantity(...args)` rather than a captured `collectionStore.getQuantity`
// reference) so `sandbox.stub(collectionStore, "getQuantity")` applied after the adapter is
// built (the pattern every test in test/storage/adapters/ uses) keeps working.

function createNedbAdapter() {
    return {
        adapterName: "nedb",
        collection: {
            getQuantity: (...args) => collectionStore.getQuantity(...args),
            upsert: (...args) => collectionStore.upsert(...args),
            setQuantity: (...args) => collectionStore.setQuantity(...args),
            remove: (...args) => collectionStore.remove(...args)
        },
        needsAttention: {
            insert: (...args) => needsAttentionStore.insert(...args)
        }
    };
}

export { createNedbAdapter };

export default {
    createNedbAdapter
};
