import { assert } from "chai";

// Each test imports a fresh module instance (cache-busting query string) since
// src/storage/index.mjs memoizes its adapter in module-level state.
async function freshStorage() {
    const mod = await import(`../../src/storage/index.mjs?t=${Date.now()}-${Math.random()}`);
    return mod.default;
}

describe("storage::index (lazy adapter resolution)", () => {
    const savedAdapter = process.env.STORAGE_ADAPTER;

    afterEach(() => {
        if (savedAdapter === undefined) {
            delete process.env.STORAGE_ADAPTER;
        } else {
            process.env.STORAGE_ADAPTER = savedAdapter;
        }
    });

    it("defaults to nedb when nothing is set", async () => {
        delete process.env.STORAGE_ADAPTER;
        const storage = await freshStorage();
        assert.equal(storage.adapterName, "nedb");
    });

    it("honors STORAGE_ADAPTER set AFTER import but BEFORE first real use", async () => {
        delete process.env.STORAGE_ADAPTER;
        const storage = await freshStorage();
        // Simulate the real consumer pattern (match-name.mjs): grab a method reference
        // at import time, same as `const dependencies = { GetNames: storage.names.getAll }`.
        const getAll = storage.names.getAll;

        // CLI flag applied AFTER the import graph has already loaded, same as index.mjs's run().
        process.env.STORAGE_ADAPTER = "rds";

        assert.equal(
            storage.adapterName,
            "rds",
            "adapter must not have been locked in at import time"
        );
        assert.isFunction(getAll, "captured method reference should still be a callable wrapper");
    });

    it("memoizes the adapter after first resolution (does not flip mid-run)", async () => {
        delete process.env.STORAGE_ADAPTER;
        const storage = await freshStorage();

        assert.equal(storage.adapterName, "nedb");
        process.env.STORAGE_ADAPTER = "rds";
        assert.equal(
            storage.adapterName,
            "nedb",
            "already-resolved adapter should stay stable for the rest of the run"
        );
    });
});
