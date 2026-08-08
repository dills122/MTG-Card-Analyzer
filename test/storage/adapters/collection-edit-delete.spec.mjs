import { assert } from "chai";
import sinon from "sinon";
import collectionStore from "../../../src/db-local/collection-store.mjs";
import rds from "../../../src/rds/index.mjs";
import { createNedbAdapter } from "../../../src/storage/adapters/nedb-adapter.mjs";
import { createRdsAdapter } from "../../../src/storage/adapters/rds-adapter.mjs";

// Covers just the new setQuantity/remove methods on both adapters -- the rest of each
// adapter's surface (getQuantity/upsert/needsAttention.insert) is covered separately.
describe("storage/adapters::collection edit/delete", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("nedb adapter", () => {
        const adapter = createNedbAdapter();

        it("collection.setQuantity delegates to collectionStore.setQuantity", async () => {
            const stub = sandbox
                .stub(collectionStore, "setQuantity")
                .callsFake((name, set, qty) => Promise.resolve({ quantity: qty }));

            const result = await adapter.collection.setQuantity("Pacifism", "M20", 5);

            assert.deepEqual(result, { quantity: 5 });
            assert.isTrue(stub.calledOnceWith("Pacifism", "M20", 5));
        });

        it("collection.setQuantity rejects on error", async () => {
            sandbox.stub(collectionStore, "setQuantity").rejects(new Error("not found"));

            let caught;
            try {
                await adapter.collection.setQuantity("Nonexistent", "XYZ", 5);
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
        });

        it("collection.remove delegates to collectionStore.remove", async () => {
            const stub = sandbox
                .stub(collectionStore, "remove")
                .callsFake((name) => Promise.resolve({ cardName: name }));

            const result = await adapter.collection.remove("Pacifism", "M20");

            assert.deepEqual(result, { cardName: "Pacifism" });
            assert.isTrue(stub.calledOnceWith("Pacifism", "M20"));
        });
    });

    describe("rds adapter", () => {
        const adapter = createRdsAdapter();

        it("collection.setQuantity delegates to rds.collection.setQuantity", async () => {
            const stub = sandbox.stub(rds.collection, "setQuantity").resolves({ affectedRows: 1 });

            const result = await adapter.collection.setQuantity("Pacifism", "M20", 5);

            assert.deepEqual(result, { affectedRows: 1 });
            assert.isTrue(stub.calledOnceWith("Pacifism", "M20", 5));
        });

        it("collection.setQuantity rejects on error", async () => {
            sandbox.stub(rds.collection, "setQuantity").rejects(new Error("not found"));

            let caught;
            try {
                await adapter.collection.setQuantity("Nonexistent", "XYZ", 5);
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
        });

        it("collection.remove delegates to rds.collection.deleteRecord", async () => {
            const stub = sandbox
                .stub(rds.collection, "deleteRecord")
                .callsFake((name) => Promise.resolve({ cardName: name }));

            const result = await adapter.collection.remove("Pacifism", "M20");

            assert.deepEqual(result, { cardName: "Pacifism" });
            assert.isTrue(stub.calledOnceWith("Pacifism", "M20"));
        });
    });
});
