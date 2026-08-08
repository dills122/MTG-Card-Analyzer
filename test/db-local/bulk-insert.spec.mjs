import { assert } from "chai";
import sinon from "sinon";
import { executeBulkInsert } from "../../src/db-local/bulk-insert.mjs";

describe("db-local::bulk-insert", () => {
    it("seeds names through injected boundaries", async () => {
        const insertName = sinon.stub().resolves();
        const logger = { log: sinon.stub() };

        const result = await executeBulkInsert({
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
});
