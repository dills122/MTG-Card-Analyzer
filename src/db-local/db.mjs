import Datastore from "@dills1220/nedb";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
        process.env.CARD_NAMES_DB_PATH,
        process.env.APPDATA,
        legacyPreferencesPath,
        process.platform !== "darwin" ? path.join(home, ".local/share") : "",
        path.join(home, ".mtg-card-analyzer"),
        path.join(os.tmpdir(), "mtg-card-analyzer")
    ];

    for (const candidate of candidates) {
        const dbFile = toDbFilePath(candidate, "cardNames.db");
        if (canUsePath(dbFile)) {
            return dbFile;
        }
    }

    return path.join(os.tmpdir(), "mtg-card-analyzer", "cardNames.db");
}

const dbFilename = resolveDbFilename();

const db = new Datastore({
    filename: dbFilename,
    autoload: true
});

export { db };

export default {
    db
};
