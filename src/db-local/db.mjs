import { getConfig } from "../config/index.mjs";
import { resolveDbFilename as resolvePath } from "./resolve-db-path.mjs";
import { createNedbStore } from "./create-nedb-store.mjs";

function resolveDbFilename() {
    return resolvePath(getConfig().cardNamesDbPath, "cardNames.db");
}

const { find, insert, update, remove, count } = createNedbStore({
    resolveFilename: resolveDbFilename,
    indexes: [{ fieldName: "normalizedName" }]
});

const db = { find, insert, update, remove, count };

export { db, resolveDbFilename };

export default {
    db
};
