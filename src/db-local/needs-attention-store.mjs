import { getConfig } from "../config/index.mjs";
import { resolveDbFilename } from "./resolve-db-path.mjs";
import { createNedbStore } from "./create-nedb-store.mjs";

// Local (nedb) backend for the "real persistence" tier's needs-attention records --
// cards the matcher couldn't confidently resolve on its own. Same tier as collection-store.mjs.

const { find, insert } = createNedbStore({
    resolveFilename: () => resolveDbFilename(getConfig().cardNamesDbPath, "needs-attention.db")
});

function insert_(record) {
    const doc = { ...record, createdAt: new Date() };
    return insert(doc);
}

// Returns every needs-attention entry -- used by the nedb->rds migration (src/migrate/).
async function getAll() {
    const docs = await find({});
    return docs || [];
}

export { insert_ as insert, getAll };

export default {
    insert: insert_,
    getAll
};
