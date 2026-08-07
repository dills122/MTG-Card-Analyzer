import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Single source of truth for app-wide runtime settings.
//
// Precedence (highest wins): explicit overrides (CLI flags) > env vars > config file > defaults.
const DEFAULTS = Object.freeze({
    storageAdapter: "nedb",
    pretty: true,
    querying: false,
    cardNamesDbPath: "",
    cardHashDbPath: "",
    configPath: ""
});

const KNOWN_STORAGE_ADAPTERS = ["nedb", "rds"];

function compact(obj = {}) {
    return Object.fromEntries(
        Object.entries(obj).filter(
            ([, value]) => value !== undefined && value !== "" && value !== null
        )
    );
}

function readJsonFile(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, "utf8");
    } catch (err) {
        if (err.code === "ENOENT") {
            return {};
        }
        throw new Error(`Config file at "${filePath}" could not be read: ${err.message}`);
    }
    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new Error(`Config file at "${filePath}" is not valid JSON: ${err.message}`);
    }
}

// Where a config file lives if the caller didn't say explicitly:
// MTG_CONFIG_PATH env var, then ./mtg.config.json, then ~/.mtg-card-analyzer/config.json.
function resolveConfigFilePath(explicitPath) {
    if (explicitPath) {
        return explicitPath;
    }
    if (process.env.MTG_CONFIG_PATH) {
        return process.env.MTG_CONFIG_PATH;
    }
    const cwdConfig = path.join(process.cwd(), "mtg.config.json");
    if (fs.existsSync(cwdConfig)) {
        return cwdConfig;
    }
    const homeConfig = path.join(os.homedir(), ".mtg-card-analyzer", "config.json");
    if (fs.existsSync(homeConfig)) {
        return homeConfig;
    }
    return "";
}

function readEnvConfig() {
    return compact({
        storageAdapter: process.env.STORAGE_ADAPTER,
        cardNamesDbPath: process.env.CARD_NAMES_DB_PATH,
        cardHashDbPath: process.env.CARD_HASH_DB_PATH
    });
}

function validate(config) {
    if (!KNOWN_STORAGE_ADAPTERS.includes(config.storageAdapter)) {
        throw new Error(
            `Invalid storageAdapter "${config.storageAdapter}". Expected one of: ${KNOWN_STORAGE_ADAPTERS.join(", ")}`
        );
    }
    return config;
}

// overrides: highest-precedence values, meant for CLI flags passed explicitly by the caller.
// Re-reads env/file every call (cheap, tiny JSON) so CLI flags applied at runtime are honored
// by anything that resolves config lazily (see src/db-local/db.mjs, card-hash-cache.mjs).
function getConfig(overrides = {}) {
    const cleanOverrides = compact(overrides);
    const configFilePath = resolveConfigFilePath(cleanOverrides.configPath);
    const fileConfig = configFilePath ? compact(readJsonFile(configFilePath)) : {};
    const envConfig = readEnvConfig();

    const merged = {
        ...DEFAULTS,
        ...fileConfig,
        ...envConfig,
        ...cleanOverrides,
        configPath: configFilePath || ""
    };

    return validate(merged);
}

export { getConfig, DEFAULTS, KNOWN_STORAGE_ADAPTERS };

export default {
    getConfig,
    DEFAULTS,
    KNOWN_STORAGE_ADAPTERS
};
