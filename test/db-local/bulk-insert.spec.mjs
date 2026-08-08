import { assert } from "chai";
import sinon from "sinon";
import { ExecuteBulkInsert } from "../../src/db-local/bulk-insert.mjs";
import dbLocal from "../../src/db-local/index.mjs";

describe("db-local::bulk-insert", () => {
    it("seeds names through injected boundaries", async () => {
        const insertName = sinon.stub().resolves();
        const logger = { log: sinon.stub() };

        const result = await ExecuteBulkInsert({
            getCardNames: async () => ["Pacifism", "Fireball"],
            insertName,
            logger,
            concurrency: 1
        });

        assert.deepEqual(result, { inserted: 2 });
        assert.deepEqual(
            insertName.getCalls().map((call) => call.args[0]),
            ["Pacifism", "Fireball"]
        );
    });

    it("keeps db-local public exports wired", () => {
        assert.isObject(dbLocal.LocalCardDb);
        assert.isFunction(dbLocal.GetBulkNames);
        assert.isObject(dbLocal.CardHashes);
    });
});
