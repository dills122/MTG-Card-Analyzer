import { getConfig } from "../config/index.mjs";
import { resolveDbFilename } from "./resolve-db-path.mjs";
import { createNedbStore } from "./create-nedb-store.mjs";

// Local (nedb) backend for the "real persistence" tier's needs-attention records --
// cards the matcher couldn't confidently resolve on its own. Same tier as collection-store.mjs.

const { getDbInstance } = createNedbStore({
    resolveFilename: () => resolveDbFilename(getConfig().cardNamesDbPath, "needs-attention.db")
});

function Insert(record, cb) {
    const doc = { ...record, createdAt: new Date() };
    getDbInstance().insert(doc, cb);
}

// Returns every needs-attention entry -- used by the nedb->rds migration (src/migrate/).
function GetAll(cb) {
    getDbInstance().find({}, (err, docs) => {
        if (err) {
            return cb(err, null);
        }
        return cb(null, docs || []);
    });
}

export { Insert, GetAll };

export default {
    Insert,
    GetAll
};
