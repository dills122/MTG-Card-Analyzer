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
        const doc = await new Promise((resolve, reject) => {
            store.Insert(
                {
                    cardName: "Pacifism",
                    extractedText: "clean",
                    dirtyExtractedText: "dirty",
                    nameImage: "base64==",
                    possibleSets: "M20,M21"
                },
                (err, d) => (err ? reject(err) : resolve(d))
            );
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
        const first = await new Promise((resolve, reject) => {
            store.Insert(record, (err, d) => (err ? reject(err) : resolve(d)));
        });
        const second = await new Promise((resolve, reject) => {
            store.Insert(record, (err, d) => (err ? reject(err) : resolve(d)));
        });
        assert.notEqual(first._id, second._id);
    });
});
