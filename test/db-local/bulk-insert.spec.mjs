import { assert } from "chai";
import sinon from "sinon";
import { executeBulkInsert, runBulkInsertCli } from "../../src/db-local/bulk-insert.mjs";

describe("db-local::bulk-insert", () => {
    it("seeds names through injected boundaries", async () => {
        const upsertName = sinon.stub().resolves();
        const logger = { log: sinon.stub() };

        const result = await executeBulkInsert({
            getCardNames: async () => ["Pacifism", "Fireball"],
            getStoredNames: async () => [],
            upsertName,
            removeName: sinon.stub().resolves(),
            logger,
            concurrency: 1
        });

        assert.deepEqual(result, {
            fetched: 2,
            accepted: 2,
            rejected: 0,
            catalogDuplicates: 0,
            inserted: 2,
            updated: 0,
            removed: 0,
            unchanged: 0
        });
        assert.deepEqual(
            upsertName.getCalls().map((call) => call.args[0]),
            [
                { name: "Pacifism", normalizedName: "PACIFISM", kind: "inserted" },
                { name: "Fireball", normalizedName: "FIREBALL", kind: "inserted" }
            ]
        );
    });

    it("returns nonzero and reports catalog failures from the CLI boundary", async () => {
        const logger = { error: sinon.stub() };

        const exitCode = await runBulkInsertCli({
            execute: sinon.stub().rejects(new Error("catalog unavailable")),
            logger
        });

        assert.equal(exitCode, 1);
        assert.isTrue(
            logger.error.calledOnceWithExactly("Card-name seed failed: catalog unavailable")
        );
    });
});
