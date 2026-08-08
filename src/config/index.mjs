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
    configPath: "",
    // The local nedb cache (names dictionary, hash cache, ops log) is always on unless
    // explicitly turned off -- see --no-local-cache / LOCAL_CACHE_ENABLED. This is distinct
    // from storageAdapter, which selects the backend for *real* persistence (collection,
    // needsAttention).
    localCacheEnabled: true,
    // Collection/needs-attention tracking is an opt-in module, off by default -- not
    // everyone scanning cards wants this tool keeping an inventory. `scan --query` only
    // writes collection/needs-attention records when this is on; explicitly invoking
    // `collection update`/`remove` or `migrate` doesn't need it re-passed, since naming
    // those commands is itself the opt-in for that invocation.
    collectionEnabled: false,
    // Captures extra detail in the ops log per scan (full match candidates/confidence, keeps
    // preprocessing temp images instead of cleaning them up) and includes it in `diagnostics`.
    // Off by default -- meant for troubleshooting, not routine use.
    debugLogging: false
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

function parseBoolean(value) {
    if (value === undefined) {
        return undefined;
    }
    return !["false", "0", ""].includes(String(value).toLowerCase());
}

function readEnvConfig() {
    return compact({
        storageAdapter: process.env.STORAGE_ADAPTER,
        cardNamesDbPath: process.env.CARD_NAMES_DB_PATH,
        cardHashDbPath: process.env.CARD_HASH_DB_PATH,
        localCacheEnabled: parseBoolean(process.env.LOCAL_CACHE_ENABLED),
        collectionEnabled: parseBoolean(process.env.COLLECTION_ENABLED),
        debugLogging: parseBoolean(process.env.DEBUG_LOGGING)
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
