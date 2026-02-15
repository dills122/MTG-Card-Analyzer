import Datastore from "@dills1220/nedb";
import path from "node:path";

const configuredPath =
    process.env.CARD_NAMES_DB_PATH ||
    process.env.APPDATA ||
    (process.platform === "darwin"
        ? process.env.HOME + "/Library/Preferences"
        : process.env.HOME + "/.local/share");

const dbFilename =
    path.extname(configuredPath).toLowerCase() === ".db"
        ? configuredPath
        : path.join(configuredPath, "cardNames.db");

const db = new Datastore({
    filename: dbFilename,
    autoload: true
});

export { db };

export default {
    db
};
