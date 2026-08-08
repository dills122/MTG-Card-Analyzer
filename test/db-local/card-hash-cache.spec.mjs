import { assert } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("db-local::card-hash-cache", () => {
    const temporaryDirectories = [];
    const savedNamesPath = process.env.CARD_NAMES_DB_PATH;
    const savedHashPath = process.env.CARD_HASH_DB_PATH;

    async function freshCache() {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-card-hash-cache-test-"));
        temporaryDirectories.push(directory);
        process.env.CARD_HASH_DB_PATH = directory;
        return import(`../../src/db-local/card-hash-cache.mjs?t=${Date.now()}-${Math.random()}`);
    }

    afterEach(() => {
        temporaryDirectories.splice(0).forEach((directory) => {
            fs.rmSync(directory, { recursive: true, force: true });
        });
        if (savedNamesPath === undefined) delete process.env.CARD_NAMES_DB_PATH;
        else process.env.CARD_NAMES_DB_PATH = savedNamesPath;
        if (savedHashPath === undefined) delete process.env.CARD_HASH_DB_PATH;
        else process.env.CARD_HASH_DB_PATH = savedHashPath;
    });

    it("normalizes legacy field names and retrieves hashes by card name", async () => {
        const cache = await freshCache();

        await cache.insertEntity({
            Name: "  Pacifism  ",
            SetName: "  Core Set 2020  ",
            CardHash: "  abc123  ",
            IsFoil: true,
            CardUrl: " https://example.test/card.jpg "
        });
        const hashes = await cache.getHashes("Pacifism");

        assert.lengthOf(hashes, 1);
        assert.include(hashes[0], {
            cardName: "Pacifism",
            setName: "Core Set 2020",
            cardHash: "abc123",
            isFoil: true,
            isPromo: false,
            cardUrl: "https://example.test/card.jpg",
            hashMode: "full-card"
        });
        assert.equal(hashes[0].lookupKey, "Pacifism::Core Set 2020::1::0::abc123");
        assert.instanceOf(hashes[0].createdAt, Date);
        assert.instanceOf(hashes[0].updatedAt, Date);
    });

    it("preserves an explicit hashMode instead of defaulting it", async () => {
        const cache = await freshCache();

        await cache.insertEntity({
            cardName: "Pacifism",
            setName: "M20",
            cardHash: "abc123",
            hashMode: "set-symbol"
        });
        const [hash] = await cache.getHashes("Pacifism");

        assert.equal(hash.hashMode, "set-symbol");
    });

    it("upserts the same printing/hash instead of duplicating it", async () => {
        const cache = await freshCache();
        const record = { cardName: "Pacifism", setName: "M20", cardHash: "abc123" };

        await cache.insertEntity(record);
        const [firstInsert] = await cache.getHashes("Pacifism");
        await cache.insertEntity({ ...record, cardUrl: "https://example.test/new.jpg" });
        const hashes = await cache.getHashes("Pacifism");

        assert.lengthOf(hashes, 1);
        assert.equal(hashes[0].cardUrl, "https://example.test/new.jpg");
        assert.equal(hashes[0].createdAt.getTime(), firstInsert.createdAt.getTime());
    });

    it("ignores incomplete cache records", async () => {
        const cache = await freshCache();

        await cache.insertEntity({ cardName: "Pacifism", setName: "M20" });
        const hashes = await cache.getHashes("Pacifism");

        assert.deepEqual(hashes, []);
    });
});
