import { db } from "./db.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import { pathToFileURL } from "node:url";
import { seedCardNames } from "./seed-card-names.mjs";

const { getCardNames } = scryfallApi;

const dependencies = {
    getCardNames,
    insertName(name) {
        return db.insert({ name });
    }
};

async function executeBulkInsert(options = {}) {
    return seedCardNames({
        getCardNames: options.getCardNames || dependencies.getCardNames,
        insertName: options.insertName || dependencies.insertName,
        logger: options.logger || console,
        concurrency: options.concurrency
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    executeBulkInsert().catch((error) => {
        console.error(`Card-name seed failed: ${error?.message || String(error)}`);
        process.exitCode = 1;
    });
}

export { dependencies, executeBulkInsert };

export default {
    executeBulkInsert
};
