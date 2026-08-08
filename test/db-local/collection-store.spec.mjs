import { assert } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Each test gets a fresh module instance (cache-busting query string) pointed at its own
// tmp dir, since collection-store.mjs memoizes its nedb instance in module-level state.
async function freshStore() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-collection-store-test-"));
    process.env.CARD_NAMES_DB_PATH = tmpDir;
    const mod = await import(
        `../../src/db-local/collection-store.mjs?t=${Date.now()}-${Math.random()}`
    );
    return mod.default;
}

describe("db-local::collection-store", () => {
    const savedEnv = process.env.CARD_NAMES_DB_PATH;

    afterEach(() => {
        if (savedEnv === undefined) {
            delete process.env.CARD_NAMES_DB_PATH;
        } else {
            process.env.CARD_NAMES_DB_PATH = savedEnv;
        }
    });

    it("inserts a new record with quantity = delta on first upsert", async () => {
        const store = await freshStore();
        const doc = await store.upsert({
            cardName: "Pacifism",
            cardSet: "M20",
            cardType: "Enchantment"
        });
        assert.equal(doc.quantity, 1);
        assert.equal(doc.cardName, "Pacifism");
    });

    it("increments quantity on repeat upsert instead of overwriting it", async () => {
        const store = await freshStore();
        const record = { cardName: "Pacifism", cardSet: "M20", cardType: "Enchantment" };
        await store.upsert(record);
        const second = await store.upsert(record);
        assert.equal(second.quantity, 2);

        const qty = await store.getQuantity("Pacifism", "M20");
        assert.equal(qty, 2);
    });

    it("computes estValue from priceUsd * final quantity, not just the delta", async () => {
        const store = await freshStore();
        const record = {
            cardName: "Pacifism",
            cardSet: "M20",
            cardType: "Enchantment",
            priceUsd: 2.5
        };
        await store.upsert(record);
        const second = await store.upsert(record);
        assert.equal(second.quantity, 2);
        assert.equal(second.estValue, 5, "2 copies at $2.50 = $5.00");
    });

    it("getQuantity returns 0 for a card/set that was never inserted", async () => {
        const store = await freshStore();
        const qty = await store.getQuantity("Nonexistent", "XYZ");
        assert.equal(qty, 0);
    });

    it("treats different cardSet values as separate stacks", async () => {
        const store = await freshStore();
        await store.upsert({ cardName: "Pacifism", cardSet: "M20" });
        await store.upsert({ cardName: "Pacifism", cardSet: "M21" });
        const qtyM20 = await store.getQuantity("Pacifism", "M20");
        const qtyM21 = await store.getQuantity("Pacifism", "M21");
        assert.equal(qtyM20, 1);
        assert.equal(qtyM21, 1);
    });

    describe("GetAll", () => {
        it("returns every collection entry", async () => {
            const store = await freshStore();
            await store.upsert({ cardName: "Pacifism", cardSet: "M20" });
            await store.upsert({ cardName: "Llanowar Elves", cardSet: "M20" });

            const all = await store.getAll();
            assert.lengthOf(all, 2);
            assert.sameMembers(
                all.map((d) => d.cardName),
                ["Pacifism", "Llanowar Elves"]
            );
        });

        it("returns an empty array when nothing has been stored", async () => {
            const store = await freshStore();
            const all = await store.getAll();
            assert.deepEqual(all, []);
        });
    });

    describe("setQuantity", () => {
        it("overwrites quantity and rescales estValue proportionally", async () => {
            const store = await freshStore();
            const record = { cardName: "Pacifism", cardSet: "M20", priceUsd: 2.5 };
            await store.upsert(record);
            await store.upsert(record); // quantity=2, estValue=5

            const updated = await store.setQuantity("Pacifism", "M20", 10);
            assert.equal(updated.quantity, 10);
            assert.equal(updated.estValue, 25, "(5/2)*10 = 25");
        });

        it("errors on a card/set that doesn't exist -- won't silently create one", async () => {
            const store = await freshStore();
            let caught;
            try {
                await store.setQuantity("Nonexistent", "XYZ", 5);
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
            assert.match(caught.message, /No collection entry/);
        });
    });

    describe("Remove", () => {
        it("deletes the entry and returns the removed doc", async () => {
            const store = await freshStore();
            await store.upsert({ cardName: "Pacifism", cardSet: "M20" });

            const removed = await store.remove("Pacifism", "M20");
            assert.equal(removed.cardName, "Pacifism");

            const qty = await store.getQuantity("Pacifism", "M20");
            assert.equal(qty, 0);
        });

        it("returns null (no error) when nothing matches", async () => {
            const store = await freshStore();
            const removed = await store.remove("Nonexistent", "XYZ");
            assert.isNull(removed);
        });
    });
});
