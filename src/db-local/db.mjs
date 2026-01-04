import Datastore from "@dills1220/nedb";

const basePath =
    process.env.CARD_NAMES_DB_PATH ||
    process.env.APPDATA ||
    (process.platform === "darwin"
        ? process.env.HOME + "/Library/Preferences"
        : process.env.HOME + "/.local/share");

const db = new Datastore({
    filename: `${basePath}/cardNames.db`,
    autoload: true
});

export { db };

export default {
    db
};
