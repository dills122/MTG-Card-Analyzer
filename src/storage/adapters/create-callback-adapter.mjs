// TEMPORARY MIGRATION SHIM -- not meant to be a permanent fixture.
//
// This exists only because src/db-local/*.mjs and src/rds/*.mjs are still callback-based
// (nedb's native API, and the hand-written mysql2 wrappers modeled after it). The real fix is
// to make those store modules themselves return promises natively -- e.g. wrap each nedb call
// once inside create-nedb-store.mjs, and rewrite the rds/*.mjs query wrappers as async
// functions -- so nothing downstream needs to promisify a callback API at all. Once that
// lands, this file and both createXAdapter() factories collapse to a plain object literal
// (`{ adapterName: "nedb", collection: { getQuantity: collectionStore.getQuantity, ... } }`)
// with no wrapping step. Tracked as a follow-up; don't build more on top of this shim.
//
// Until then: shared promisify-based storage adapter factory. nedb-adapter.mjs and
// rds-adapter.mjs each used to hand-wrap the same 5 callback methods in
// `new Promise((resolve, reject) => store.Method(..., (err, result) => ...))` -- 10
// near-identical blocks between them. One factory now.
//
// Looks the method up on the store object BY NAME at call time (not a captured function
// reference) so tests that `sandbox.stub(store, "MethodName")` *after* the adapter is built keep
// working -- same dynamic-dispatch behavior the original hand-written wrappers had.
function promisifyMethod(store, methodName) {
    return (...args) =>
        new Promise((resolve, reject) => {
            store[methodName](...args, (err, result) => {
                if (err) {
                    return reject(err);
                }
                return resolve(result);
            });
        });
}

function createCallbackAdapter(
    adapterName,
    { collectionStore, collectionMethods, needsAttentionStore, needsAttentionInsertMethod }
) {
    return {
        adapterName,
        collection: {
            getQuantity: promisifyMethod(collectionStore, collectionMethods.getQuantity),
            upsert: promisifyMethod(collectionStore, collectionMethods.upsert),
            setQuantity: promisifyMethod(collectionStore, collectionMethods.setQuantity),
            remove: promisifyMethod(collectionStore, collectionMethods.remove)
        },
        needsAttention: {
            insert: promisifyMethod(needsAttentionStore, needsAttentionInsertMethod)
        }
    };
}

export { createCallbackAdapter };

export default { createCallbackAdapter };
