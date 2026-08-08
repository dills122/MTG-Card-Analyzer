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

function normalizeRecord(record = {}) {
    const cardName = record.cardName || record.CardName || record.Name || "";
    const setName = record.setName || record.SetName || "";
    const cardHash = record.cardHash || record.CardHash || "";
    const isFoil = Boolean(record.isFoil || record.IsFoil);
    const isPromo = Boolean(record.isPromo || record.IsPromo);
    const cardUrl = record.cardUrl || record.CardUrl || "";
    const normalized = {
        cardName: String(cardName).trim(),
        setName: String(setName).trim(),
        cardHash: String(cardHash).trim(),
        isFoil,
        isPromo,
        cardUrl: String(cardUrl).trim(),
        updatedAt: new Date()
    };
    normalized.lookupKey = toLookupKey(normalized);
    return normalized;
}

function InsertEntity(record) {
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

function GetHashes(name, cb) {
    db.find({ cardName: name }, (err, docs) => {
        if (err) {
            return cb(err);
        }
        return cb(null, docs || []);
    });
}

export { InsertEntity, GetHashes, db };

export default {
    InsertEntity,
    GetHashes,
    db
};
