import { assert } from "chai";
import sinon from "sinon";
import collectionStore from "../../../src/db-local/collection-store.mjs";
import needsAttentionStore from "../../../src/db-local/needs-attention-store.mjs";
import { createNedbAdapter } from "../../../src/storage/adapters/nedb-adapter.mjs";

describe("storage/adapters::nedb-adapter", () => {
    let sandbox;
    let adapter;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        adapter = createNedbAdapter();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("adapterName is nedb", () => {
        assert.equal(adapter.adapterName, "nedb");
    });

    describe("collection.getQuantity", () => {
        it("resolves with the quantity, passing name/set through unchanged", async () => {
            const stub = sandbox
                .stub(collectionStore, "getQuantity")
                .callsFake((name, set, cb) => cb(null, 3));

            const result = await adapter.collection.getQuantity("Pacifism", "M20");

            assert.equal(result, 3);
            assert.isTrue(stub.calledOnceWith("Pacifism", "M20"));
        });

        it("rejects when the store errors", async () => {
            sandbox.stub(collectionStore, "getQuantity").callsFake((name, set, cb) => {
                cb(new Error("disk full"));
            });

            let caught;
            try {
                await adapter.collection.getQuantity("Pacifism", "M20");
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
            assert.equal(caught.message, "disk full");
        });
    });

    describe("collection.upsert", () => {
        it("resolves with the upserted doc, passing the record through unchanged", async () => {
            const record = { cardName: "Pacifism", cardSet: "M20" };
            const doc = { ...record, quantity: 1 };
            const stub = sandbox
                .stub(collectionStore, "upsert")
                .callsFake((rec, cb) => cb(null, doc));

            const result = await adapter.collection.upsert(record);

            assert.deepEqual(result, doc);
            assert.isTrue(stub.calledOnceWith(record));
        });

        it("rejects when the store errors", async () => {
            sandbox
                .stub(collectionStore, "upsert")
                .callsFake((rec, cb) => cb(new Error("write failed")));

            let caught;
            try {
                await adapter.collection.upsert({ cardName: "Pacifism", cardSet: "M20" });
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
            assert.equal(caught.message, "write failed");
        });
    });

    describe("needsAttention.insert", () => {
        it("resolves with the inserted doc, passing the record through unchanged", async () => {
            const record = { cardName: "Pacifism", extractedText: "clean" };
            const doc = { ...record, _id: "abc" };
            const stub = sandbox
                .stub(needsAttentionStore, "insert")
                .callsFake((rec, cb) => cb(null, doc));

            const result = await adapter.needsAttention.insert(record);

            assert.deepEqual(result, doc);
            assert.isTrue(stub.calledOnceWith(record));
        });

        it("rejects when the store errors", async () => {
            sandbox
                .stub(needsAttentionStore, "insert")
                .callsFake((rec, cb) => cb(new Error("write failed")));

            let caught;
            try {
                await adapter.needsAttention.insert({ cardName: "Pacifism" });
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
            assert.equal(caught.message, "write failed");
        });
    });
});
