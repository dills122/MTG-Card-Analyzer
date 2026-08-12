import { getConfig } from "../config/index.mjs";
import { resolveDbFilename as resolvePath } from "./resolve-db-path.mjs";
import { createNedbStore } from "./create-nedb-store.mjs";
import log from "../logger/log.mjs";

const logger = log.create({ isPretty: true });

function resolveDbFilename() {
    const config = getConfig();
    return resolvePath(config.cardHashDbPath || config.cardNamesDbPath, "card-hashes.db");
}

const { find, findOne, update } = createNedbStore({
    resolveFilename: resolveDbFilename,
    indexes: [{ fieldName: "lookupKey", unique: true }, { fieldName: "cardName" }]
});

function toLookupKey(record) {
    const cardName = String(record.cardName || "").trim();
    const setName = String(record.setName || "").trim();
    const cardHash = String(record.cardHash || "").trim();
    const isFoil = Boolean(record.isFoil);
    const isPromo = Boolean(record.isPromo);
    const printId = String(record.printId || "").trim();
    const setCode = String(record.setCode || "").trim();
    const collectorNumber = String(record.collectorNumber || "").trim();
    const language = String(record.language || "en").trim();
    const hashMode = String(record.hashMode || "full-card").trim();
    const printIdentity = printId || `${setCode}:${collectorNumber}:${language}`;
    return `${cardName}::${setName}::${printIdentity}::${isFoil ? 1 : 0}::${isPromo ? 1 : 0}::${hashMode}::${cardHash}`;
}

// Every current writer (back-filler.mjs, process-hashes.mjs) sends fully camelCase fields, but
// this cache accepts legacy/PascalCase field names defensively too (see
// test/db-local/card-hash-cache.spec.mjs) -- keep the fallback.
function normalizeRecord(record = {}) {
    const cardName = record.cardName || record.CardName || record.Name || "";
    const setName = record.setName || record.SetName || "";
    const cardHash = record.cardHash || record.CardHash || "";
    const isFoil = Boolean(record.isFoil || record.IsFoil);
    const isPromo = Boolean(record.isPromo || record.IsPromo);
    const cardUrl = record.cardUrl || record.CardUrl || record.imageUrl || "";
    // Defaults to "full-card" for writers/legacy rows that predate this field -- matches
    // back-filler.mjs's real behavior (always full-card, never cropped) and process-hashes.mjs's
    // own joi default, so an untagged on-disk row is classified correctly with no migration.
    const hashMode = record.hashMode || record.HashMode || "full-card";
    const printId = record.printId || record.PrintId || "";
    const oracleId = record.oracleId || record.OracleId || "";
    const setCode = record.setCode || record.SetCode || "";
    const collectorNumber = record.collectorNumber || record.CollectorNumber || "";
    const language = record.language || record.Language || "en";
    const illustrationId = record.illustrationId || record.IllustrationId || "";
    const scryfallUri = record.scryfallUri || record.ScryfallUri || "";
    const normalized = {
        cardName: String(cardName).trim(),
        setName: String(setName).trim(),
        cardHash: String(cardHash).trim(),
        isFoil,
        isPromo,
        cardUrl: String(cardUrl).trim(),
        hashMode: String(hashMode).trim(),
        printId: String(printId).trim(),
        oracleId: String(oracleId).trim(),
        setCode: String(setCode).trim().toUpperCase(),
        collectorNumber: String(collectorNumber).trim(),
        language: String(language).trim().toLowerCase(),
        illustrationId: String(illustrationId).trim(),
        scryfallUri: String(scryfallUri).trim(),
        updatedAt: new Date()
    };
    normalized.lookupKey = toLookupKey(normalized);
    return normalized;
}

async function insertEntity(record) {
    const normalized = normalizeRecord(record);
    if (!normalized.cardName || !normalized.setName || !normalized.cardHash) {
        logger.warn("Skipping card-hash cache write: missing cardName, setName, or cardHash", {
            cardName: normalized.cardName,
            setName: normalized.setName
        });
        return 0;
    }
    const query = { lookupKey: normalized.lookupKey };
    const existing = await findOne(query);
    const fields = existing ? normalized : { ...normalized, createdAt: new Date() };
    return update(query, { $set: fields }, { upsert: true });
}

async function getHashes(name) {
    const docs = await find({ cardName: name });
    return docs || [];
}

export { insertEntity, getHashes };

export default {
    insertEntity,
    getHashes
};
