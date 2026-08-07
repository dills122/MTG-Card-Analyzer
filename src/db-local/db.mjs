import Datastore from "@dills1220/nedb";
import { getConfig } from "../config/index.mjs";
import { resolveDbFilename as resolvePath } from "./resolve-db-path.mjs";

function resolveDbFilename() {
    return resolvePath(getConfig().cardNamesDbPath, "cardNames.db");
}

// Resolved lazily on first real use (not at import time) so config sourced from
// CLI flags -- applied to process.env by index.mjs before the pipeline runs -- is honored.
let dbInstance;

function getDbInstance() {
    if (!dbInstance) {
        dbInstance = new Datastore({
            filename: resolveDbFilename(),
            autoload: true
        });
    }
    return dbInstance;
}

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

export { db, resolveDbFilename };

export default {
    db
};
