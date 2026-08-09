import { assert } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { gatherDiagnostics } from "../../src/diagnostics/index.mjs";

const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
const appVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;

describe("diagnostics::index", () => {
    let sandbox;
    let environmentCheckStub;
    let getConfigStub;
    let dumpOperationsStub;
    let dependencies;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        environmentCheckStub = sandbox.stub().resolves({
            checks: [{ label: "Node fixture", status: "pass" }],
            requiredFailures: 0,
            warnings: [],
            cardNameIndex: {
                totalRows: 1000,
                validRows: 1000,
                uniqueNames: 1000,
                invalidRows: 0,
                duplicateRows: 0
            }
        });
        getConfigStub = sandbox.stub().returns({
            storageAdapter: "nedb",
            localCacheEnabled: true,
            collectionEnabled: false,
            debugLogging: false,
            queryingEnabled: false,
            prettyLogging: true,
            cardNamesDbPath: "",
            cardHashDbPath: "",
            configPath: ""
        });
        dumpOperationsStub = sandbox.stub().resolves([]);
        dependencies = {
            runEnvironmentCheck: environmentCheckStub,
            getConfig: getConfigStub,
            dumpOperations: dumpOperationsStub
        };
    });

    afterEach(() => {
        sandbox.restore();
    });

    const gather = (options) => gatherDiagnostics(options, dependencies);

    it("includes app/node/platform version info", async () => {
        const bundle = await gather();

        assert.equal(bundle.versions.app, appVersion);
        assert.equal(bundle.versions.node, process.versions.node);
        assert.equal(bundle.versions.platform, process.platform);
        assert.equal(bundle.versions.arch, process.arch);
    });

    it("includes an environment check with checks/requiredFailures/warnings", async () => {
        const bundle = await gather();

        assert.deepEqual(bundle.environment, {
            checks: [{ label: "Node fixture", status: "pass" }],
            requiredFailures: 0,
            warnings: [],
            cardNameIndex: {
                totalRows: 1000,
                validRows: 1000,
                uniqueNames: 1000,
                invalidRows: 0,
                duplicateRows: 0
            }
        });
    });

    it("includes only the safe-to-share config fields (no secrets)", async () => {
        const bundle = await gather();

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

    it("passes limit through to the operations log and returns its result", async () => {
        dumpOperationsStub.resolves([{ decision: "collection", filePath: "./a.jpg" }]);

        const bundle = await gather({ limit: 7 });

        assert.isTrue(dumpOperationsStub.calledOnceWith({ limit: 7 }));
        assert.deepEqual(bundle.recentOperations, [
            { decision: "collection", filePath: "./a.jpg" }
        ]);
    });

    it("defaults limit to 20 when not provided", async () => {
        await gather();

        assert.isTrue(dumpOperationsStub.calledOnceWith({ limit: 20 }));
    });

    it("rejects when the ops log fails to read", async () => {
        dumpOperationsStub.rejects(new Error("db locked"));

        let caughtError;
        try {
            await gather();
        } catch (err) {
            caughtError = err;
        }
        assert.equal(caughtError?.message, "db locked");
    });

    it("passes withMysql through and surfaces the resulting environment check", async () => {
        environmentCheckStub.resolves({
            checks: [{ label: "secure.config.cjs not found", status: "fail" }],
            requiredFailures: 0,
            warnings: ["secure.config.cjs not found"]
        });

        const bundle = await gather({ withMysql: true });

        assert.isTrue(environmentCheckStub.calledOnceWith({ withMysql: true }));
        assert.equal(bundle.environment.checks[0].label, "secure.config.cjs not found");
    });

    it("does not request the MySQL check by default", async () => {
        await gather();

        assert.isTrue(environmentCheckStub.calledOnceWith({ withMysql: false }));
    });
});
