import { getConfig } from "../config/index.mjs";
import { resolveDbFilename as resolvePath } from "./resolve-db-path.mjs";
import { createNedbStore } from "./create-nedb-store.mjs";

function resolveDbFilename() {
    const config = getConfig();
    return resolvePath(config.cardHashDbPath || config.cardNamesDbPath, "card-hashes.db");
}

const { db } = createNedbStore({
    resolveFilename: resolveDbFilename,
    indexes: [{ fieldName: "lookupKey", unique: true }, { fieldName: "cardName" }]
});

function toLookupKey(record) {
    const cardName = String(record.cardName || "").trim();
    const setName = String(record.setName || "").trim();
    const cardHash = String(record.cardHash || "").trim();
    const isFoil = Boolean(record.isFoil);
    const isPromo = Boolean(record.isPromo);
    return `${cardName}::${setName}::${isFoil ? 1 : 0}::${isPromo ? 1 : 0}::${cardHash}`;
}

// Every writer (back-filler.mjs, process-hashes.mjs) sends fully camelCase fields -- no
// PascalCase fallback needed here.
function normalizeRecord(record = {}) {
    const normalized = {
        cardName: String(record.cardName || "").trim(),
        setName: String(record.setName || "").trim(),
        cardHash: String(record.cardHash || "").trim(),
        isFoil: Boolean(record.isFoil),
        isPromo: Boolean(record.isPromo),
        cardUrl: String(record.cardUrl || "").trim(),
        updatedAt: new Date()
    };
    normalized.lookupKey = toLookupKey(normalized);
    return normalized;
}

function insertEntity(record) {
    const normalized = normalizeRecord(record);
    if (!normalized.cardName || !normalized.setName || !normalized.cardHash) {
        return;
    }
    db.update(
        { lookupKey: normalized.lookupKey },
        { $set: normalized, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
        () => {}
    );
}

function getHashes(name, cb) {
    db.find({ cardName: name }, (err, docs) => {
        if (err) {
            return cb(err);
        }
        return cb(null, docs || []);
    });
}

export { insertEntity, getHashes, db };

export default {
    insertEntity,
    getHashes,
    db
};
