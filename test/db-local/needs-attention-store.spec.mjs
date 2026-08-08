import { assert } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function freshStore() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-nda-store-test-"));
    process.env.CARD_NAMES_DB_PATH = tmpDir;
    const mod = await import(
        `../../src/db-local/needs-attention-store.mjs?t=${Date.now()}-${Math.random()}`
    );
    return mod.default;
}

describe("db-local::needs-attention-store", () => {
    const savedEnv = process.env.CARD_NAMES_DB_PATH;

    afterEach(() => {
        if (savedEnv === undefined) {
            delete process.env.CARD_NAMES_DB_PATH;
        } else {
            process.env.CARD_NAMES_DB_PATH = savedEnv;
        }
    });

    it("inserts a record and stamps createdAt", async () => {
        const store = await freshStore();
        const doc = await store.insert({
            cardName: "Pacifism",
            extractedText: "clean",
            dirtyExtractedText: "dirty",
            nameImage: "base64==",
            possibleSets: "M20,M21"
        });
        assert.equal(doc.cardName, "Pacifism");
        assert.instanceOf(doc.createdAt, Date);
    });

    it("does not dedupe -- each needs-attention insert is independent", async () => {
        const store = await freshStore();
        const record = {
            cardName: "Pacifism",
            extractedText: "clean",
            dirtyExtractedText: "dirty",
            nameImage: "base64==",
            possibleSets: "M20,M21"
        };
        const first = await store.insert(record);
        const second = await store.insert(record);
        assert.notEqual(first._id, second._id);
    });

    describe("GetAll", () => {
        it("returns every needs-attention entry", async () => {
            const store = await freshStore();
            await store.insert({ cardName: "Pacifism", extractedText: "clean" });
            await store.insert({ cardName: "Fake Card", extractedText: "clean" });

            const all = await store.getAll();
            assert.lengthOf(all, 2);
        });

        it("returns an empty array when nothing has been stored", async () => {
            const store = await freshStore();
            const all = await store.getAll();
            assert.deepEqual(all, []);
        });
    });
});
