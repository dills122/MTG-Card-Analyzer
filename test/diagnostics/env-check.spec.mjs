import { assert } from "chai";
import { runEnvironmentCheck } from "../../src/diagnostics/env-check.mjs";

// Exercises the real local environment (same checks scripts/verify-env.mjs runs) rather than
// mocking every fs/DB dependency -- the point of this module is "is the environment actually
// usable", so a real repo checkout with a seeded local cache is the meaningful thing to assert
// against. See test/diagnostics/index.spec.mjs for gatherDiagnostics()'s own wiring.
describe("diagnostics::env-check", () => {
    it("returns checks/requiredFailures/warnings with no unhandled rejection", async () => {
        const result = await runEnvironmentCheck();

        assert.isArray(result.checks);
        assert.isNotEmpty(result.checks);
        assert.isNumber(result.requiredFailures);
        assert.isArray(result.warnings);
        result.checks.forEach((check) => {
            assert.hasAllKeys(check, ["label", "status"]);
            assert.include(["pass", "fail"], check.status);
        });
    });

    it("checks Node version against the >=20 floor", async () => {
        const result = await runEnvironmentCheck();
        const nodeCheck = result.checks.find((check) => check.label.startsWith("Node "));
        assert.exists(nodeCheck);
        assert.equal(nodeCheck.status, "pass", "this test suite itself requires Node >=20");
    });

    it("reports the resolved config (storageAdapter/localCacheEnabled/collectionEnabled/debugLogging/queryingEnabled/prettyLogging)", async () => {
        const result = await runEnvironmentCheck();
        const labels = result.checks.map((check) => check.label);
        assert.isTrue(labels.some((label) => label.startsWith("storageAdapter")));
        assert.isTrue(labels.some((label) => label.startsWith("localCacheEnabled")));
        assert.isTrue(labels.some((label) => label.startsWith("collectionEnabled")));
        assert.isTrue(labels.some((label) => label.startsWith("debugLogging")));
        assert.isTrue(labels.some((label) => label.startsWith("queryingEnabled")));
        assert.isTrue(labels.some((label) => label.startsWith("prettyLogging")));
    });

    it("skips the MySQL check by default (withMysql: false)", async () => {
        const result = await runEnvironmentCheck();
        const labels = result.checks.map((check) => check.label);
        assert.isFalse(labels.some((label) => label.includes("MySQL")));
    });

    it("runs a MySQL-related check when withMysql is true", async () => {
        const result = await runEnvironmentCheck({ withMysql: true });
        const labels = result.checks.map((check) => check.label);
        assert.isTrue(
            labels.some((label) => label.includes("MySQL") || label.includes("secure.config.cjs"))
        );
    });
});
