import { db } from "./db.mjs";
import scryfallApi from "../scryfall-api/index.mjs";
import { pathToFileURL } from "node:url";
import { seedCardNames } from "./seed-card-names.mjs";

const { getCardNames } = scryfallApi;

function getStoredNames() {
    return db.find({});
}

function upsertStoredName({ name, normalizedName, existingRecord }) {
    const query = existingRecord?._id ? { _id: existingRecord._id } : { normalizedName };
    return db.update(query, { $set: { name, normalizedName } }, { upsert: !existingRecord });
}

function removeStoredName(record) {
    if (!record?._id) {
        throw new Error("Stored card-name row is missing its database identifier");
    }
    return db.remove({ _id: record._id }, {});
}

async function executeBulkInsert(options = {}) {
    const {
        getCardNames: fetchCardNames = getCardNames,
        getStoredNames: readStoredNames = getStoredNames,
        upsertName = upsertStoredName,
        removeName = removeStoredName,
        logger = console,
        concurrency
    } = options;
    return seedCardNames({
        getCardNames: fetchCardNames,
        getStoredNames: readStoredNames,
        upsertName,
        removeName,
        logger,
        concurrency
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    process.exitCode = await runBulkInsertCli();
}

async function runBulkInsertCli({ execute = executeBulkInsert, logger = console } = {}) {
    try {
        await execute();
        return 0;
    } catch (error) {
        logger.error(`Card-name seed failed: ${error?.message || String(error)}`);
        return 1;
    }
}

export { executeBulkInsert, runBulkInsertCli };

export default {
    executeBulkInsert
};
