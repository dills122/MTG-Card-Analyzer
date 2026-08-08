import Datastore from "@dills1220/nedb";
import { getConfig } from "../config/index.mjs";
import { resolveDbFilename as resolvePath } from "./resolve-db-path.mjs";

function resolveDbFilename() {
    const config = getConfig();
    return resolvePath(config.cardHashDbPath || config.cardNamesDbPath, "card-hashes.db");
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
        dbInstance.ensureIndex({ fieldName: "lookupKey", unique: true });
        dbInstance.ensureIndex({ fieldName: "cardName" });
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

function InsertEntity(record, callback = () => {}) {
    const normalized = normalizeRecord(record);
    if (!normalized.cardName || !normalized.setName || !normalized.cardHash) {
        callback(null, 0);
        return;
    }
    const query = { lookupKey: normalized.lookupKey };
    db.findOne(query, (findError, existing) => {
        if (findError) {
            callback(findError);
            return;
        }
        const fields = existing ? normalized : { ...normalized, createdAt: new Date() };
        db.update(query, { $set: fields }, { upsert: true }, callback);
    });
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
