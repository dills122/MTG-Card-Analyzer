import { assert } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    getConfig as resolveConfig,
    getConfigWithSources as resolveConfigWithSources,
    resolveConfigWriteTarget as findConfigWriteTarget,
    writeConfigValue,
    DEFAULTS,
    SETTABLE_KEYS
} from "../../src/config/index.mjs";

describe("config::index", () => {
    const envKeys = [
        "STORAGE_ADAPTER",
        "CARD_NAMES_DB_PATH",
        "CARD_HASH_DB_PATH",
        "MTG_CONFIG_PATH",
        "LOCAL_CACHE_ENABLED",
        "COLLECTION_ENABLED",
        "DEBUG_LOGGING",
        "QUERYING_ENABLED",
        "PRETTY_LOGGING"
    ];
    let savedEnv;
    let tmpDir;
    let configDiscovery;

    const getConfig = (overrides) => resolveConfig(overrides, configDiscovery);
    const getConfigWithSources = (overrides) =>
        resolveConfigWithSources(overrides, configDiscovery);
    const resolveConfigWriteTarget = (explicitPath) =>
        findConfigWriteTarget(explicitPath, configDiscovery);

    beforeEach(() => {
        savedEnv = {};
        envKeys.forEach((key) => {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        });
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-config-test-"));
        configDiscovery = { cwd: tmpDir, homeDir: tmpDir };
    });

    afterEach(() => {
        envKeys.forEach((key) => {
            if (savedEnv[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = savedEnv[key];
            }
        });
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns defaults when nothing else is set", () => {
        const config = getConfig();
        assert.equal(config.storageAdapter, DEFAULTS.storageAdapter);
        assert.equal(config.prettyLogging, DEFAULTS.prettyLogging);
        assert.equal(config.configPath, "");
        assert.equal(config.collectionEnabled, false, "opt-in module, off by default");
        assert.equal(config.debugLogging, false, "opt-in, off by default");
    });

    it("COLLECTION_ENABLED env var turns the collection module on", () => {
        process.env.COLLECTION_ENABLED = "true";
        assert.equal(getConfig().collectionEnabled, true);
    });

    it("DEBUG_LOGGING env var turns verbose ops-log capture on", () => {
        process.env.DEBUG_LOGGING = "true";
        assert.equal(getConfig().debugLogging, true);
    });

    it("explicit collectionEnabled override wins over the env var", () => {
        process.env.COLLECTION_ENABLED = "true";
        assert.equal(getConfig({ collectionEnabled: false }).collectionEnabled, false);
    });

    it("env vars override defaults", () => {
        process.env.STORAGE_ADAPTER = "rds";
        process.env.CARD_NAMES_DB_PATH = "/tmp/names";
        const config = getConfig();
        assert.equal(config.storageAdapter, "rds");
        assert.equal(config.cardNamesDbPath, "/tmp/names");
    });

    it("config file overrides defaults when no env var is set", () => {
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(configFile, JSON.stringify({ storageAdapter: "rds" }));
        const config = getConfig({ configPath: configFile });
        assert.equal(config.storageAdapter, "rds");
    });

    it("env vars still win over config file (env > file precedence)", () => {
        process.env.STORAGE_ADAPTER = "rds";
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(configFile, JSON.stringify({ storageAdapter: "nedb" }));
        const config = getConfig({ configPath: configFile });
        assert.equal(
            config.storageAdapter,
            "rds",
            "env still wins over file per documented precedence"
        );
    });

    it("explicit overrides (CLI) win over everything", () => {
        process.env.STORAGE_ADAPTER = "rds";
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(configFile, JSON.stringify({ storageAdapter: "rds" }));
        const config = getConfig({ configPath: configFile, storageAdapter: "nedb" });
        assert.equal(config.storageAdapter, "nedb");
    });

    it("throws a clear error for an unknown storage adapter", () => {
        assert.throws(
            () => getConfig({ storageAdapter: "mongo" }),
            /Invalid storageAdapter "mongo"/
        );
    });

    it("throws a clear error for malformed config file JSON", () => {
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(configFile, "{not valid json");
        assert.throws(() => getConfig({ configPath: configFile }), /not valid JSON/);
    });

    it("rejects incorrect config-file value types instead of treating strings as booleans", () => {
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(configFile, JSON.stringify({ localCacheEnabled: "false" }));

        assert.throws(
            () => getConfig({ configPath: configFile }),
            /Invalid config file.*localCacheEnabled.*must be a boolean/
        );
    });

    it("rejects unknown config-file keys so misspellings cannot be ignored", () => {
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(configFile, JSON.stringify({ prettyLoging: false }));

        assert.throws(
            () => getConfig({ configPath: configFile }),
            /Invalid config file.*prettyLoging.*not allowed/
        );
    });

    it("rejects invalid boolean environment values", () => {
        process.env.LOCAL_CACHE_ENABLED = "flase";

        assert.throws(
            () => getConfig(),
            /LOCAL_CACHE_ENABLED must be true or false or 1 or 0, got "flase"/
        );
    });

    it("accepts numeric boolean environment tokens", () => {
        process.env.LOCAL_CACHE_ENABLED = "0";
        process.env.DEBUG_LOGGING = "1";

        const config = getConfig();
        assert.equal(config.localCacheEnabled, false);
        assert.equal(config.debugLogging, true);
    });

    it("returns empty file config when the resolved config file doesn't exist", () => {
        const missingFile = path.join(tmpDir, "does-not-exist.json");
        const config = getConfig({ configPath: missingFile });
        assert.equal(config.storageAdapter, DEFAULTS.storageAdapter);
    });

    it("debugLogging defaults to false", () => {
        const config = getConfig();
        assert.equal(config.debugLogging, DEFAULTS.debugLogging);
        assert.equal(config.debugLogging, false);
    });

    it("debugLogging can be turned on via config file", () => {
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(configFile, JSON.stringify({ debugLogging: true }));
        const config = getConfig({ configPath: configFile });
        assert.equal(config.debugLogging, true);
    });

    it("DEBUG_LOGGING env var overrides the config file", () => {
        process.env.DEBUG_LOGGING = "true";
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(configFile, JSON.stringify({ debugLogging: false }));
        const config = getConfig({ configPath: configFile });
        assert.equal(config.debugLogging, true);
    });

    it("DEBUG_LOGGING=false env var is honored, not treated as unset", () => {
        process.env.DEBUG_LOGGING = "false";
        const config = getConfig({ debugLogging: undefined });
        assert.equal(config.debugLogging, false);
    });

    it("an explicit debugLogging override (CLI) wins over the env var", () => {
        process.env.DEBUG_LOGGING = "true";
        const config = getConfig({ debugLogging: false });
        assert.equal(config.debugLogging, false, "explicit override should win over env var");
    });

    it("queryingEnabled defaults to false, prettyLogging defaults to true", () => {
        const config = getConfig();
        assert.equal(config.queryingEnabled, DEFAULTS.queryingEnabled);
        assert.equal(config.queryingEnabled, false);
        assert.equal(config.prettyLogging, DEFAULTS.prettyLogging);
        assert.equal(config.prettyLogging, true);
    });

    it("queryingEnabled/prettyLogging can be set via the config file", () => {
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(
            configFile,
            JSON.stringify({ queryingEnabled: true, prettyLogging: false })
        );
        const config = getConfig({ configPath: configFile });
        assert.equal(config.queryingEnabled, true);
        assert.equal(config.prettyLogging, false);
    });

    it("QUERYING_ENABLED/PRETTY_LOGGING env vars override the config file", () => {
        process.env.QUERYING_ENABLED = "true";
        process.env.PRETTY_LOGGING = "false";
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(
            configFile,
            JSON.stringify({ queryingEnabled: false, prettyLogging: true })
        );
        const config = getConfig({ configPath: configFile });
        assert.equal(config.queryingEnabled, true);
        assert.equal(config.prettyLogging, false);
    });

    it("explicit queryingEnabled/prettyLogging overrides (CLI, tri-state) win over the env var", () => {
        process.env.QUERYING_ENABLED = "true";
        process.env.PRETTY_LOGGING = "true";
        const config = getConfig({ queryingEnabled: false, prettyLogging: false });
        assert.equal(config.queryingEnabled, false);
        assert.equal(config.prettyLogging, false);
    });

    it("an undefined queryingEnabled/prettyLogging override (flag not passed) does not clobber config", () => {
        const configFile = path.join(tmpDir, "mtg.config.json");
        fs.writeFileSync(configFile, JSON.stringify({ queryingEnabled: true }));
        const config = getConfig({
            configPath: configFile,
            queryingEnabled: undefined,
            prettyLogging: undefined
        });
        assert.equal(config.queryingEnabled, true);
        assert.equal(config.prettyLogging, DEFAULTS.prettyLogging);
    });

    describe("getConfigWithSources (`config list`)", () => {
        it("labels every unset key as default", () => {
            const { config, sources } = getConfigWithSources();
            assert.equal(config.storageAdapter, DEFAULTS.storageAdapter);
            Object.keys(DEFAULTS).forEach((key) => {
                assert.equal(sources[key], "default", `expected ${key} to be sourced default`);
            });
        });

        it("labels a config-file value as file, an env value as env, an override as cli", () => {
            process.env.DEBUG_LOGGING = "true";
            const configFile = path.join(tmpDir, "mtg.config.json");
            fs.writeFileSync(configFile, JSON.stringify({ storageAdapter: "rds" }));

            const { sources } = getConfigWithSources({
                configPath: configFile,
                queryingEnabled: true
            });

            assert.equal(sources.storageAdapter, "file");
            assert.equal(sources.debugLogging, "env");
            assert.equal(sources.queryingEnabled, "cli");
            assert.equal(sources.prettyLogging, "default");
        });
    });

    describe("resolveConfigWriteTarget (`config set` target file)", () => {
        it("uses the explicit path when given", () => {
            const target = resolveConfigWriteTarget("/explicit/path.json");
            assert.equal(target, "/explicit/path.json");
        });

        it("reuses an already-existing resolved config file when no explicit path is given", () => {
            const configFile = path.join(tmpDir, "mtg.config.json");
            fs.writeFileSync(configFile, "{}");
            process.env.MTG_CONFIG_PATH = configFile;

            const target = resolveConfigWriteTarget();

            assert.equal(target, configFile);
        });

        it("falls back to MTG_CONFIG_PATH when nothing exists there yet", () => {
            const missingFile = path.join(tmpDir, "does-not-exist-yet.json");
            process.env.MTG_CONFIG_PATH = missingFile;

            const target = resolveConfigWriteTarget();

            assert.equal(target, missingFile);
        });
    });

    describe("writeConfigValue (`config set`)", () => {
        it("creates the file with the single key when nothing exists yet", () => {
            const configFile = path.join(tmpDir, "mtg.config.json");
            const result = writeConfigValue(configFile, "storageAdapter", "rds");

            assert.deepEqual(result, { key: "storageAdapter", value: "rds", filePath: configFile });
            assert.deepEqual(JSON.parse(fs.readFileSync(configFile, "utf8")), {
                storageAdapter: "rds"
            });
        });

        it("merges into an existing file, preserving other keys", () => {
            const configFile = path.join(tmpDir, "mtg.config.json");
            fs.writeFileSync(configFile, JSON.stringify({ storageAdapter: "rds" }));

            writeConfigValue(configFile, "debugLogging", "true");

            assert.deepEqual(JSON.parse(fs.readFileSync(configFile, "utf8")), {
                storageAdapter: "rds",
                debugLogging: true
            });
        });

        it("coerces boolean keys strictly (true/false only)", () => {
            const configFile = path.join(tmpDir, "mtg.config.json");
            writeConfigValue(configFile, "queryingEnabled", "true");
            assert.deepEqual(JSON.parse(fs.readFileSync(configFile, "utf8")), {
                queryingEnabled: true
            });

            assert.throws(
                () => writeConfigValue(configFile, "queryingEnabled", "yes"),
                /expects true or false/
            );
        });

        it("rejects an unknown storageAdapter without writing", () => {
            const configFile = path.join(tmpDir, "mtg.config.json");
            assert.throws(
                () => writeConfigValue(configFile, "storageAdapter", "mongo"),
                /must be one of: nedb, rds/
            );
            assert.isFalse(fs.existsSync(configFile));
        });

        it("rejects an unknown config key", () => {
            const configFile = path.join(tmpDir, "mtg.config.json");
            assert.throws(
                () => writeConfigValue(configFile, "bogusKey", "x"),
                /Unknown config key "bogusKey"/
            );
        });

        it("does not allow setting configPath -- it's resolution metadata, not a real setting", () => {
            assert.isFalse("configPath" in SETTABLE_KEYS);
        });

        it("creates parent directories that don't exist yet", () => {
            const nestedPath = path.join(tmpDir, "nested", "dir", "mtg.config.json");
            writeConfigValue(nestedPath, "storageAdapter", "nedb");
            assert.isTrue(fs.existsSync(nestedPath));
        });
    });
});
