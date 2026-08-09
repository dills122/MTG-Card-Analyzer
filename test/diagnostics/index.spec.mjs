import { assert } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import storage from "../../src/storage/index.mjs";
import { gatherDiagnostics } from "../../src/diagnostics/index.mjs";

const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
const appVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;

// runEnvironmentCheck itself is exercised in real conditions against the actual repo/local
// cache (same checks scripts/verify-env.mjs runs) -- see test/diagnostics/env-check.spec.mjs.
// Here we only stub the one live dependency that would otherwise touch a real ops-log file
// (storage.log.dump) and assert gatherDiagnostics wires everything together correctly.
describe("diagnostics::index", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("includes app/node/platform version info", async () => {
        sandbox.stub(storage.log, "dump").resolves([]);

        const bundle = await gatherDiagnostics();

        assert.equal(bundle.versions.app, appVersion);
        assert.equal(bundle.versions.node, process.versions.node);
        assert.equal(bundle.versions.platform, process.platform);
        assert.equal(bundle.versions.arch, process.arch);
    });

    it("includes an environment check with checks/requiredFailures/warnings", async () => {
        sandbox.stub(storage.log, "dump").resolves([]);

        const bundle = await gatherDiagnostics();

        assert.isArray(bundle.environment.checks);
        assert.isNotEmpty(bundle.environment.checks);
        assert.isNumber(bundle.environment.requiredFailures);
        assert.isArray(bundle.environment.warnings);
        if (bundle.environment.cardNameIndex) {
            assert.hasAllKeys(bundle.environment.cardNameIndex, [
                "totalRows",
                "validRows",
                "uniqueNames",
                "invalidRows",
                "duplicateRows"
            ]);
        }
    });

    it("includes only the safe-to-share config fields (no secrets)", async () => {
        sandbox.stub(storage.log, "dump").resolves([]);

        const bundle = await gatherDiagnostics();

        assert.hasAllKeys(bundle.config, [
            "storageAdapter",
            "localCacheEnabled",
            "collectionEnabled",
            "debugLogging",
            "queryingEnabled",
            "prettyLogging",
            "cardNamesDbPath",
            "cardHashDbPath",
            "configPath"
        ]);
    });

    it("passes limit through to storage.log.dump and returns its result as recentOperations", async () => {
        const dumpStub = sandbox
            .stub(storage.log, "dump")
            .resolves([{ decision: "collection", filePath: "./a.jpg" }]);

        const bundle = await gatherDiagnostics({ limit: 7 });

        assert.isTrue(dumpStub.calledOnceWith({ limit: 7 }));
        assert.deepEqual(bundle.recentOperations, [
            { decision: "collection", filePath: "./a.jpg" }
        ]);
    });

    it("defaults limit to 20 when not provided", async () => {
        const dumpStub = sandbox.stub(storage.log, "dump").resolves([]);

        await gatherDiagnostics();

        assert.isTrue(dumpStub.calledOnceWith({ limit: 20 }));
    });

    it("rejects when the ops log fails to read", async () => {
        sandbox.stub(storage.log, "dump").rejects(new Error("db locked"));

        let caughtError;
        try {
            await gatherDiagnostics();
        } catch (err) {
            caughtError = err;
        }
        assert.equal(caughtError?.message, "db locked");
    });

    it("surfaces a MySQL-not-configured check when withMysql is true and secure.config.cjs is absent", async () => {
        sandbox.stub(storage.log, "dump").resolves([]);

        const bundle = await gatherDiagnostics({ withMysql: true });

        const labels = bundle.environment.checks.map((check) => check.label);
        assert.isTrue(labels.some((label) => label.includes("secure.config.cjs not found")));
    });

    it("does not run the MySQL check when withMysql is false (default)", async () => {
        sandbox.stub(storage.log, "dump").resolves([]);

        const bundle = await gatherDiagnostics();

        const labels = bundle.environment.checks.map((check) => check.label);
        assert.isFalse(
            labels.some((label) => label.includes("MySQL") || label.includes("secure.config.cjs"))
        );
    });
});
