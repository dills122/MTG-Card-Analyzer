import { db } from "./db.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import { pathToFileURL } from "node:url";
import { seedCardNames } from "./seed-card-names.mjs";

const { getCardNames } = scryfallApi;

function insertStoredName(name) {
    return db.insert({ name });
}

async function executeBulkInsert(options = {}) {
    const {
        getCardNames: fetchCardNames = getCardNames,
        insertName = insertStoredName,
        logger = console,
        concurrency
    } = options;
    return seedCardNames({
        getCardNames: fetchCardNames,
        insertName,
        logger,
        concurrency
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    executeBulkInsert().catch((error) => {
        console.error(`Card-name seed failed: ${error?.message || String(error)}`);
        process.exitCode = 1;
    });
}

export { executeBulkInsert };

export default {
    executeBulkInsert
};
