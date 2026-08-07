import Datastore from "@dills1220/nedb";
import { getConfig } from "../config/index.mjs";
import { resolveDbFilename } from "./resolve-db-path.mjs";

// Local (nedb) backend for the "real persistence" tier's needs-attention records --
// cards the matcher couldn't confidently resolve on its own. Same tier as collection-store.mjs.

let dbInstance;

function getDbInstance() {
    if (!dbInstance) {
        dbInstance = new Datastore({
            filename: resolveDbFilename(getConfig().cardNamesDbPath, "needs-attention.db"),
            autoload: true
        });
    }
    return dbInstance;
}

function Insert(record, cb) {
    const doc = { ...record, createdAt: new Date() };
    getDbInstance().insert(doc, cb);
}

export { Insert };

export default {
    Insert
};
