import Datastore from "@dills1220/nedb";

// Shared lazy-Datastore bootstrap -- every local nedb-backed store (db.mjs, collection-store.mjs,
// needs-attention-store.mjs, card-hash-cache.mjs, ops-log.mjs) used to hand-roll this same
// "create on first real use, not at import time" singleton so CLI-flag config (applied to
// process.env by index.mjs before the pipeline runs) is honored. One factory now, each caller
// only supplies what actually differs: where the file lives and which indexes it needs.
//
// Every Datastore call is wrapped here, once, so callers get a plain promise-based API and
// never touch nedb's native callback signature themselves.
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

    function find(query, projection = {}) {
        return new Promise((resolve, reject) => {
            getDbInstance().find(query, projection, (err, docs) => {
                if (err) {
                    return reject(err);
                }
                return resolve(docs);
            });
        });
    }

    // Cursor-based variant for callers that need sort/skip/limit (nedb only exposes those on
    // the cursor find() returns when called without a callback) -- e.g. ops-log's "newest
    // first, capped at N" queries.
    function findSorted(query, { sort, skip, limit, projection = {} } = {}) {
        return new Promise((resolve, reject) => {
            let cursor = getDbInstance().find(query, projection);
            if (sort) {
                cursor = cursor.sort(sort);
            }
            if (typeof skip === "number") {
                cursor = cursor.skip(skip);
            }
            if (typeof limit === "number") {
                cursor = cursor.limit(limit);
            }
            cursor.exec((err, docs) => {
                if (err) {
                    return reject(err);
                }
                return resolve(docs);
            });
        });
    }

    function findOne(query, projection = {}) {
        return new Promise((resolve, reject) => {
            getDbInstance().findOne(query, projection, (err, doc) => {
                if (err) {
                    return reject(err);
                }
                return resolve(doc);
            });
        });
    }

    function insert(doc) {
        return new Promise((resolve, reject) => {
            getDbInstance().insert(doc, (err, inserted) => {
                if (err) {
                    return reject(err);
                }
                return resolve(inserted);
            });
        });
    }

    function update(query, updateQuery, options = {}) {
        return new Promise((resolve, reject) => {
            getDbInstance().update(
                query,
                updateQuery,
                options,
                (err, numAffected, affectedDocuments, upsert) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve({ numAffected, affectedDocuments, upsert });
                }
            );
        });
    }

    function remove(query, options = {}) {
        return new Promise((resolve, reject) => {
            getDbInstance().remove(query, options, (err, numRemoved) => {
                if (err) {
                    return reject(err);
                }
                return resolve(numRemoved);
            });
        });
    }

    function count(query = {}) {
        return new Promise((resolve, reject) => {
            getDbInstance().count(query, (err, n) => {
                if (err) {
                    return reject(err);
                }
                return resolve(n);
            });
        });
    }

    return { getDbInstance, find, findSorted, findOne, insert, update, remove, count };
}

export { createNedbStore };

export default { createNedbStore };
