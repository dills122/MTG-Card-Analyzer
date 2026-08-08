import { assert } from "chai";
import sinon from "sinon";
import rds from "../../../src/rds/index.mjs";
import { createRdsAdapter } from "../../../src/storage/adapters/rds-adapter.mjs";

describe("storage/adapters::rds-adapter", () => {
    let sandbox;
    let adapter;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        adapter = createRdsAdapter();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("adapterName is rds", () => {
        assert.equal(adapter.adapterName, "rds");
    });

    describe("collection.getQuantity", () => {
        it("resolves with the quantity, passing name/set through unchanged", async () => {
            const stub = sandbox.stub(rds.collection, "getQuantity").resolves(5);

            const result = await adapter.collection.getQuantity("Pacifism", "M20");

            assert.equal(result, 5);
            assert.isTrue(stub.calledOnceWith("Pacifism", "M20"));
        });

        it("rejects when the rds module errors", async () => {
            sandbox.stub(rds.collection, "getQuantity").rejects(new Error("connection refused"));

            let caught;
            try {
                await adapter.collection.getQuantity("Pacifism", "M20");
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
            assert.equal(caught.message, "connection refused");
        });
    });

    describe("collection.upsert", () => {
        it("resolves with the query results, passing the record through unchanged", async () => {
            const record = { cardName: "Pacifism", cardSet: "M20", priceUsd: 2.5 };
            const results = { affectedRows: 1 };
            const stub = sandbox.stub(rds.collection, "upsertRecord").resolves(results);

            const result = await adapter.collection.upsert(record);

            assert.deepEqual(result, results);
            assert.isTrue(stub.calledOnceWith(record));
        });

        it("rejects when the rds module errors", async () => {
            sandbox.stub(rds.collection, "upsertRecord").rejects(new Error("connection refused"));

            let caught;
            try {
                await adapter.collection.upsert({ cardName: "Pacifism", cardSet: "M20" });
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
            assert.equal(caught.message, "connection refused");
        });
    });

    describe("needsAttention.insert", () => {
        it("resolves with the query results, passing the record through unchanged", async () => {
            const record = { cardName: "Pacifism", extractedText: "clean" };
            const results = { insertId: 1 };
            const stub = sandbox.stub(rds.needsAttention, "insertRecord").resolves(results);

            const result = await adapter.needsAttention.insert(record);

            assert.deepEqual(result, results);
            assert.isTrue(stub.calledOnceWith(record));
        });

        it("rejects when the rds module errors", async () => {
            sandbox
                .stub(rds.needsAttention, "insertRecord")
                .rejects(new Error("connection refused"));

            let caught;
            try {
                await adapter.needsAttention.insert({ cardName: "Pacifism" });
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
            assert.equal(caught.message, "connection refused");
        });
    });
});
