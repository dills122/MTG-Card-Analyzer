import Datastore from "@dills1220/nedb";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function toDbFilePath(basePath, fileName) {
    if (!basePath) {
        return "";
    }
    return path.extname(basePath).toLowerCase() === ".db"
        ? basePath
        : path.join(basePath, fileName);
}

function canUsePath(filePath) {
    if (!filePath) {
        return false;
    }
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.accessSync(path.dirname(filePath), fs.constants.R_OK | fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

function resolveDbFilename() {
    const home = process.env.HOME || os.tmpdir();
    const legacyPreferencesPath =
        process.platform === "darwin" ? path.join(home, "Library/Preferences") : "";
    const candidates = [
        process.env.CARD_HASH_DB_PATH,
        process.env.CARD_NAMES_DB_PATH,
        process.env.APPDATA,
        legacyPreferencesPath,
        process.platform !== "darwin" ? path.join(home, ".local/share") : "",
        path.join(home, ".mtg-card-analyzer"),
        path.join(os.tmpdir(), "mtg-card-analyzer")
    ];

    for (const candidate of candidates) {
        const dbFile = toDbFilePath(candidate, "card-hashes.db");
        if (canUsePath(dbFile)) {
            return dbFile;
        }
    }

    return path.join(os.tmpdir(), "mtg-card-analyzer", "card-hashes.db");
}

const dbFilename = resolveDbFilename();

const db = new Datastore({
    filename: dbFilename,
    autoload: true
});

db.ensureIndex({ fieldName: "lookupKey", unique: true });
db.ensureIndex({ fieldName: "cardName" });

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
