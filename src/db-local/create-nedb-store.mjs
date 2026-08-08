import Datastore from "@dills1220/nedb";

// Shared lazy-Datastore bootstrap -- every local nedb-backed store (db.mjs, collection-store.mjs,
// needs-attention-store.mjs, card-hash-cache.mjs, ops-log.mjs) used to hand-roll this same
// "create on first real use, not at import time" singleton so CLI-flag config (applied to
// process.env by index.mjs before the pipeline runs) is honored. One factory now, each caller
// only supplies what actually differs: where the file lives and which indexes it needs.
function createNedbStore({ resolveFilename, indexes = [] }) {
    let dbInstance;

    function getDbInstance() {
        if (!dbInstance) {
            dbInstance = new Datastore({
                filename: resolveFilename(),
                autoload: true
            });
            indexes.forEach((index) => dbInstance.ensureIndex(index));
        }
        return dbInstance;
    }

    // Proxy so callers can use `db.find(...)`, `db.update(...)`, etc. directly without ever
    // touching getDbInstance() themselves -- methods are resolved (and bound) lazily on first
    // property access, same as before.
    const db = new Proxy(
        {},
        {
            get(_target, prop) {
                const instance = getDbInstance();
                const value = instance[prop];
                return typeof value === "function" ? value.bind(instance) : value;
            }
        }
    );

    return { getDbInstance, db };
}

export { createNedbStore };

export default { createNedbStore };
