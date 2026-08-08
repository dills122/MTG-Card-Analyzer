import rds from "../../rds/index.mjs";
import { createCallbackAdapter } from "./create-callback-adapter.mjs";

// "Real persistence" tier, MySQL-backed (opt-in via STORAGE_ADAPTER=rds). Names/hashes/ops-log
// stay on the always-on local nedb cache regardless of this setting (see storage/index.mjs) --
// this adapter previously faked a "names" implementation by silently reading the local nedb
// file, which was misleading; that's gone now that names aren't adapter-selectable at all.

function createRdsAdapter() {
    return createCallbackAdapter("rds", {
        collectionStore: rds.collection,
        collectionMethods: {
            getQuantity: "getQuantity",
            upsert: "upsertRecord",
            setQuantity: "setQuantity",
            remove: "deleteRecord"
        },
        needsAttentionStore: rds.needsAttention,
        needsAttentionInsertMethod: "insertRecord"
    });
}

export { createRdsAdapter };

export default {
    createRdsAdapter
};
