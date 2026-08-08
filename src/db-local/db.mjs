import { getConfig } from "../config/index.mjs";
import { resolveDbFilename as resolvePath } from "./resolve-db-path.mjs";
import { createNedbStore } from "./create-nedb-store.mjs";

function resolveDbFilename() {
    return resolvePath(getConfig().cardNamesDbPath, "cardNames.db");
}

const { find, insert, count } = createNedbStore({ resolveFilename: resolveDbFilename });

const db = { find, insert, count };

export { db, resolveDbFilename };

export default {
    db
};
