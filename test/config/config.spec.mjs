import { assert } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getConfig, DEFAULTS } from "../../src/config/index.mjs";

describe("config::index", () => {
    const envKeys = [
        "STORAGE_ADAPTER",
        "CARD_NAMES_DB_PATH",
        "CARD_HASH_DB_PATH",
        "MTG_CONFIG_PATH"
    ];
    let savedEnv;
    let tmpDir;

    beforeEach(() => {
        savedEnv = {};
        envKeys.forEach((key) => {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        });
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-config-test-"));
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
        assert.equal(config.pretty, DEFAULTS.pretty);
        assert.equal(config.configPath, "");
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

    it("returns empty file config when the resolved config file doesn't exist", () => {
        const missingFile = path.join(tmpDir, "does-not-exist.json");
        const config = getConfig({ configPath: missingFile });
        assert.equal(config.storageAdapter, DEFAULTS.storageAdapter);
    });
});
