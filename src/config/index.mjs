import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.mjs";
import {
    DEFAULTS,
    KNOWN_STORAGE_ADAPTERS,
    SETTABLE_KEYS,
    validateConfigLayer,
    validateResolvedConfig
} from "./schema.mjs";
import { parseBoolean } from "./value-parsers.mjs";

// Single source of truth for app-wide runtime settings.
//
// Precedence (highest wins): explicit overrides (CLI flags) > env vars > config file > defaults.
function omitUndefined(obj = {}) {
    return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
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

// Validates + coerces a raw CLI string into the right type for a settable config key.
// Throws a message-ready Error on anything unrecognized -- callers (config-set CLI handler)
// just need to catch and print err.message.
function coerceSettableValue(key, rawValue) {
    const spec = SETTABLE_KEYS[key];
    if (!spec) {
        throw new Error(
            `Unknown config key "${key}". Known keys: ${Object.keys(SETTABLE_KEYS).join(", ")}`
        );
    }
    if (spec.type === "boolean") {
        try {
            return parseBoolean(rawValue, { label: `"${key}"`, allowNumeric: false });
        } catch {
            throw new Error(`"${key}" expects true or false, got "${rawValue}"`);
        }
    }
    if (spec.type === "enum") {
        if (!spec.values.includes(rawValue)) {
            throw new Error(
                `"${key}" must be one of: ${spec.values.join(", ")} (got "${rawValue}")`
            );
        }
        return rawValue;
    }
    return rawValue;
}

function readEnvConfig() {
    return omitUndefined({
        storageAdapter: process.env.STORAGE_ADAPTER,
        cardNamesDbPath: process.env.CARD_NAMES_DB_PATH,
        cardHashDbPath: process.env.CARD_HASH_DB_PATH,
        localCacheEnabled: parseBoolean(process.env.LOCAL_CACHE_ENABLED, {
            label: "LOCAL_CACHE_ENABLED"
        }),
        collectionEnabled: parseBoolean(process.env.COLLECTION_ENABLED, {
            label: "COLLECTION_ENABLED"
        }),
        debugLogging: parseBoolean(process.env.DEBUG_LOGGING, { label: "DEBUG_LOGGING" }),
        queryingEnabled: parseBoolean(process.env.QUERYING_ENABLED, {
            label: "QUERYING_ENABLED"
        }),
        prettyLogging: parseBoolean(process.env.PRETTY_LOGGING, { label: "PRETTY_LOGGING" })
    });
}

// overrides: highest-precedence values, meant for CLI flags passed explicitly by the caller.
// Re-reads env/file every call (cheap, tiny JSON) so CLI flags applied at runtime are honored
// by anything that resolves config lazily (see src/db-local/db.mjs, card-hash-cache.mjs).
//
// Shared by getConfig() and getConfigWithSources() (`config list`'s "value + where it came
// from" view) so the two never drift apart on precedence.
function resolveConfig(overrides = {}) {
    const cleanOverrides = validateConfigLayer(omitUndefined(overrides), {
        source: "configuration overrides",
        allowConfigPath: true
    });
    const configFilePath = resolveConfigFilePath(cleanOverrides.configPath);
    const fileConfig = configFilePath
        ? validateConfigLayer(
              readJsonFile(configFilePath, { allowMissing: true, label: "Config file" }),
              { source: `config file at "${configFilePath}"` }
          )
        : {};
    const envConfig = validateConfigLayer(readEnvConfig(), { source: "environment configuration" });

    const merged = validateResolvedConfig({
        ...DEFAULTS,
        ...fileConfig,
        ...envConfig,
        ...cleanOverrides,
        configPath: configFilePath || ""
    });

    const sources = {};
    Object.keys(DEFAULTS).forEach((key) => {
        if (key in cleanOverrides) {
            sources[key] = "cli";
        } else if (key in envConfig) {
            sources[key] = "env";
        } else if (key in fileConfig) {
            sources[key] = "file";
        } else {
            sources[key] = "default";
        }
    });

    return { config: merged, sources };
}

function getConfig(overrides = {}) {
    return resolveConfig(overrides).config;
}

// For `config list`: same resolved values as getConfig(), plus where each one came from
// (cli/env/file/default).
function getConfigWithSources(overrides = {}) {
    return resolveConfig(overrides);
}

// Where `config set` (no explicit --config/MTG_CONFIG_PATH) should write to: whichever file
// is already in use per the normal read precedence, or a fresh ./mtg.config.json if nothing
// exists yet. Deliberately does NOT fall back to creating a file under the home directory --
// that path is only reused if it's already there.
function resolveConfigWriteTarget(explicitPath) {
    const existing = resolveConfigFilePath(explicitPath);
    if (existing) {
        return existing;
    }
    return (
        explicitPath || process.env.MTG_CONFIG_PATH || path.join(process.cwd(), "mtg.config.json")
    );
}

// Validates + writes a single key into the target config file, preserving whatever else is
// already there. Creates the file (and its directory) if it doesn't exist yet.
function writeConfigValue(filePath, key, rawValue) {
    const value = coerceSettableValue(key, rawValue);
    const existing = validateConfigLayer(
        readJsonFile(filePath, { allowMissing: true, label: "Config file" }),
        { source: `config file at "${filePath}"` }
    );
    const updated = { ...existing, [key]: value };
    writeJsonFileAtomic(filePath, updated, { label: "Config file" });
    return { key, value, filePath };
}

export {
    getConfig,
    getConfigWithSources,
    resolveConfigWriteTarget,
    writeConfigValue,
    DEFAULTS,
    SETTABLE_KEYS,
    KNOWN_STORAGE_ADAPTERS
};

export default {
    getConfig,
    getConfigWithSources,
    resolveConfigWriteTarget,
    writeConfigValue,
    DEFAULTS,
    SETTABLE_KEYS,
    KNOWN_STORAGE_ADAPTERS
};
