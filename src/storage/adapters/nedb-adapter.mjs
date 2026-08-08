import collectionStore from "../../db-local/collection-store.mjs";
import needsAttentionStore from "../../db-local/needs-attention-store.mjs";
import { createCallbackAdapter } from "./create-callback-adapter.mjs";

// "Real persistence" tier, nedb-backed. Names/hashes/ops-log live in the always-on cache
// tier (see src/storage/index.mjs) and are not part of this adapter -- this adapter is only
// for the data STORAGE_ADAPTER is actually meant to select a backend for: your collection
// and needs-attention records.

function createNedbAdapter() {
    return createCallbackAdapter("nedb", {
        collectionStore,
        collectionMethods: {
            getQuantity: "GetQuantity",
            upsert: "Upsert",
            setQuantity: "SetQuantity",
            remove: "Remove"
        },
        needsAttentionStore,
        needsAttentionInsertMethod: "Insert"
    });
}

export { createNedbAdapter };

export default {
    createNedbAdapter
};
