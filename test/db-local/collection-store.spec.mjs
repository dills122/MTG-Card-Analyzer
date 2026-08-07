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
        const doc = await new Promise((resolve, reject) => {
            store.Upsert(
                { cardName: "Pacifism", cardSet: "M20", cardType: "Enchantment" },
                (err, d) => (err ? reject(err) : resolve(d))
            );
        });
        assert.equal(doc.quantity, 1);
        assert.equal(doc.cardName, "Pacifism");
    });

    it("increments quantity on repeat upsert instead of overwriting it", async () => {
        const store = await freshStore();
        const record = { cardName: "Pacifism", cardSet: "M20", cardType: "Enchantment" };
        await new Promise((resolve, reject) => {
            store.Upsert(record, (err, d) => (err ? reject(err) : resolve(d)));
        });
        const second = await new Promise((resolve, reject) => {
            store.Upsert(record, (err, d) => (err ? reject(err) : resolve(d)));
        });
        assert.equal(second.quantity, 2);

        const qty = await new Promise((resolve, reject) => {
            store.GetQuantity("Pacifism", "M20", (err, q) => (err ? reject(err) : resolve(q)));
        });
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
        await new Promise((resolve, reject) => {
            store.Upsert(record, (err, d) => (err ? reject(err) : resolve(d)));
        });
        const second = await new Promise((resolve, reject) => {
            store.Upsert(record, (err, d) => (err ? reject(err) : resolve(d)));
        });
        assert.equal(second.quantity, 2);
        assert.equal(second.estValue, 5, "2 copies at $2.50 = $5.00");
    });

    it("GetQuantity returns 0 for a card/set that was never inserted", async () => {
        const store = await freshStore();
        const qty = await new Promise((resolve, reject) => {
            store.GetQuantity("Nonexistent", "XYZ", (err, q) => (err ? reject(err) : resolve(q)));
        });
        assert.equal(qty, 0);
    });

    it("treats different cardSet values as separate stacks", async () => {
        const store = await freshStore();
        await new Promise((resolve, reject) => {
            store.Upsert({ cardName: "Pacifism", cardSet: "M20" }, (err, d) =>
                err ? reject(err) : resolve(d)
            );
        });
        await new Promise((resolve, reject) => {
            store.Upsert({ cardName: "Pacifism", cardSet: "M21" }, (err, d) =>
                err ? reject(err) : resolve(d)
            );
        });
        const qtyM20 = await new Promise((resolve, reject) => {
            store.GetQuantity("Pacifism", "M20", (err, q) => (err ? reject(err) : resolve(q)));
        });
        const qtyM21 = await new Promise((resolve, reject) => {
            store.GetQuantity("Pacifism", "M21", (err, q) => (err ? reject(err) : resolve(q)));
        });
        assert.equal(qtyM20, 1);
        assert.equal(qtyM21, 1);
    });
});
