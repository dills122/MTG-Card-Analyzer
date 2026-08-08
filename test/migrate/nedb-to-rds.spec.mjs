import { assert } from "chai";
import sinon from "sinon";
import collectionStore from "../../src/db-local/collection-store.mjs";
import needsAttentionStore from "../../src/db-local/needs-attention-store.mjs";
import rds from "../../src/rds/index.mjs";
import {
    migrateCollection,
    migrateNeedsAttention,
    migrateNedbToRds
} from "../../src/migrate/nedb-to-rds.mjs";

describe("migrate::nedb-to-rds", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("migrateCollection", () => {
        it("migrates every local entry not already present on the target", async () => {
            sandbox.stub(collectionStore, "GetAll").callsFake((cb) => {
                cb(null, [
                    { cardName: "Pacifism", cardSet: "M20", quantity: 2, estValue: 5 },
                    { cardName: "Llanowar Elves", cardSet: "M20", quantity: 1, estValue: 0.5 }
                ]);
            });
            sandbox.stub(rds.Collection, "GetQuantity").callsFake((name, set, cb) => cb(null, 0));
            const upsertStub = sandbox
                .stub(rds.Collection, "UpsertRecord")
                .callsFake((record, cb) => cb(null, { affectedRows: 1 }));

            const result = await migrateCollection();

            assert.equal(result.total, 2);
            assert.equal(result.migrated, 2);
            assert.equal(result.skipped, 0);
            assert.deepEqual(result.errors, []);
            assert.isTrue(upsertStub.calledTwice);
            // delta on the wire == the local snapshot's quantity, not a hardcoded 1
            assert.equal(upsertStub.firstCall.args[0].delta, 2);
        });

        it("skips entries that already exist on the target (idempotent rerun)", async () => {
            sandbox.stub(collectionStore, "GetAll").callsFake((cb) => {
                cb(null, [{ cardName: "Pacifism", cardSet: "M20", quantity: 2, estValue: 5 }]);
            });
            sandbox.stub(rds.Collection, "GetQuantity").callsFake((name, set, cb) => cb(null, 2));
            const upsertStub = sandbox.stub(rds.Collection, "UpsertRecord");

            const result = await migrateCollection();

            assert.equal(result.skipped, 1);
            assert.equal(result.migrated, 0);
            assert.isFalse(upsertStub.called);
        });

        it("--force re-migrates entries that already exist instead of skipping", async () => {
            sandbox.stub(collectionStore, "GetAll").callsFake((cb) => {
                cb(null, [{ cardName: "Pacifism", cardSet: "M20", quantity: 2, estValue: 5 }]);
            });
            sandbox.stub(rds.Collection, "GetQuantity").callsFake((name, set, cb) => cb(null, 2));
            const upsertStub = sandbox
                .stub(rds.Collection, "UpsertRecord")
                .callsFake((record, cb) => cb(null, {}));

            const result = await migrateCollection({ force: true });

            assert.equal(result.migrated, 1);
            assert.equal(result.skipped, 0);
            assert.isTrue(upsertStub.calledOnce);
        });

        it("--dry-run reports what would migrate without writing", async () => {
            sandbox.stub(collectionStore, "GetAll").callsFake((cb) => {
                cb(null, [{ cardName: "Pacifism", cardSet: "M20", quantity: 2, estValue: 5 }]);
            });
            sandbox.stub(rds.Collection, "GetQuantity").callsFake((name, set, cb) => cb(null, 0));
            const upsertStub = sandbox.stub(rds.Collection, "UpsertRecord");

            const result = await migrateCollection({ dryRun: true });

            assert.equal(result.migrated, 1);
            assert.isFalse(upsertStub.called, "dry-run must not write");
        });

        it("collects per-entry errors instead of aborting the whole batch", async () => {
            sandbox.stub(collectionStore, "GetAll").callsFake((cb) => {
                cb(null, [
                    { cardName: "Pacifism", cardSet: "M20", quantity: 2 },
                    { cardName: "Llanowar Elves", cardSet: "M20", quantity: 1 }
                ]);
            });
            sandbox.stub(rds.Collection, "GetQuantity").callsFake((name, set, cb) => cb(null, 0));
            sandbox
                .stub(rds.Collection, "UpsertRecord")
                .onFirstCall()
                .callsFake((record, cb) => cb(new Error("connection lost")))
                .onSecondCall()
                .callsFake((record, cb) => cb(null, {}));

            const result = await migrateCollection();

            assert.equal(result.migrated, 1);
            assert.equal(result.errors.length, 1);
            assert.equal(result.errors[0].cardName, "Pacifism");
        });
    });

    describe("migrateNeedsAttention", () => {
        it("migrates every local entry", async () => {
            sandbox.stub(needsAttentionStore, "GetAll").callsFake((cb) => {
                cb(null, [{ cardName: "Fake Card", extractedText: "clean", possibleSets: "M20" }]);
            });
            const insertStub = sandbox
                .stub(rds.NDAttn, "InsertRecord")
                .callsFake((record, cb) => cb(null, {}));

            const result = await migrateNeedsAttention();

            assert.equal(result.migrated, 1);
            assert.isTrue(insertStub.calledOnce);
        });

        it("treats a unique-constraint hit as an idempotent skip, not an error", async () => {
            sandbox.stub(needsAttentionStore, "GetAll").callsFake((cb) => {
                cb(null, [{ cardName: "Fake Card", extractedText: "clean", possibleSets: "M20" }]);
            });
            const dupError = new Error("Duplicate entry");
            dupError.code = "ER_DUP_ENTRY";
            sandbox.stub(rds.NDAttn, "InsertRecord").callsFake((record, cb) => cb(dupError));

            const result = await migrateNeedsAttention();

            assert.equal(result.skipped, 1);
            assert.equal(result.migrated, 0);
            assert.deepEqual(result.errors, []);
        });

        it("treats a non-duplicate error as a real failure", async () => {
            sandbox.stub(needsAttentionStore, "GetAll").callsFake((cb) => {
                cb(null, [{ cardName: "Fake Card" }]);
            });
            sandbox
                .stub(rds.NDAttn, "InsertRecord")
                .callsFake((record, cb) => cb(new Error("connection lost")));

            const result = await migrateNeedsAttention();

            assert.equal(result.errors.length, 1);
            assert.equal(result.skipped, 0);
        });

        it("--dry-run does not write", async () => {
            sandbox.stub(needsAttentionStore, "GetAll").callsFake((cb) => {
                cb(null, [{ cardName: "Fake Card" }]);
            });
            const insertStub = sandbox.stub(rds.NDAttn, "InsertRecord");

            const result = await migrateNeedsAttention({ dryRun: true });

            assert.equal(result.migrated, 1);
            assert.isFalse(insertStub.called);
        });
    });

    describe("migrateNedbToRds", () => {
        it("runs both collection and needs-attention migration and returns both results", async () => {
            sandbox.stub(collectionStore, "GetAll").callsFake((cb) => cb(null, []));
            sandbox.stub(needsAttentionStore, "GetAll").callsFake((cb) => cb(null, []));

            const result = await migrateNedbToRds();

            assert.property(result, "collection");
            assert.property(result, "needsAttention");
            assert.equal(result.collection.total, 0);
            assert.equal(result.needsAttention.total, 0);
        });
    });
});
