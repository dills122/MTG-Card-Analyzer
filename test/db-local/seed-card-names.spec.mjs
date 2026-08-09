import { assert } from "chai";
import sinon from "sinon";
import { seedCardNames } from "../../src/db-local/seed-card-names.mjs";

function createMemoryStore(initialRows = []) {
    let nextId = 100;
    const rows = initialRows.map((row) => ({ ...row }));
    return {
        rows,
        getStoredNames: async () => rows.map((row) => ({ ...row })),
        upsertName: async ({ name, normalizedName, existingRecord }) => {
            const existing = existingRecord
                ? rows.find((row) => row._id === existingRecord._id)
                : rows.find((row) => row.normalizedName === normalizedName);
            if (existing) {
                Object.assign(existing, { name, normalizedName });
            } else {
                rows.push({ _id: String(nextId++), name, normalizedName });
            }
        },
        removeName: async (record) => {
            const index = rows.findIndex((row) => row._id === record._id);
            if (index >= 0) rows.splice(index, 1);
        }
    };
}

describe("db-local::seed-card-names", () => {
    it("upserts every matchable name with bounded concurrency and summary output", async () => {
        let active = 0;
        let maxActive = 0;
        const writes = [];
        const logger = { log: sinon.stub() };
        const upsertName = async (write) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setImmediate(resolve));
            writes.push(write);
            active -= 1;
        };

        const result = await seedCardNames({
            getCardNames: async () => ["Pacifism", "Fireball", "Unsummon", "Shivan Dragon"],
            getStoredNames: async () => [],
            upsertName,
            removeName: sinon.stub().resolves(),
            logger,
            concurrency: 2
        });

        assert.sameMembers(
            writes.map((write) => write.name),
            ["Pacifism", "Fireball", "Unsummon", "Shivan Dragon"]
        );
        assert.equal(maxActive, 2);
        assert.deepEqual(result, {
            fetched: 4,
            accepted: 4,
            rejected: 0,
            catalogDuplicates: 0,
            inserted: 4,
            updated: 0,
            removed: 0,
            unchanged: 0
        });
        assert.match(logger.log.firstCall.args[0], /^Seeding 4 matchable card names/);
        assert.match(logger.log.secondCall.args[0], /^Card-name seed complete: 4 inserted/);
    });

    it("rejects underscore-only names with the matching normalization contract", async () => {
        const store = createMemoryStore();

        const result = await seedCardNames({
            getCardNames: async () => ["Pacifism", "_____ // ______", "Pacifism"],
            ...store,
            logger: { log: sinon.stub() }
        });

        assert.deepInclude(result, {
            fetched: 3,
            accepted: 1,
            rejected: 1,
            catalogDuplicates: 1,
            inserted: 1
        });
        assert.deepEqual(
            store.rows.map((row) => row.name),
            ["Pacifism"]
        );
    });

    it("repairs invalid and duplicate stored rows and is unchanged on a second seed", async () => {
        const store = createMemoryStore([
            { _id: "1", name: "_____ // ______" },
            { _id: "2", name: "Pacifism" },
            { _id: "3", name: "Pacifism", normalizedName: "PACIFISM" }
        ]);
        const options = {
            getCardNames: async () => ["Pacifism", "Fireball"],
            ...store,
            logger: { log: sinon.stub() },
            concurrency: 1
        };

        const first = await seedCardNames(options);
        const second = await seedCardNames(options);

        assert.deepInclude(first, { inserted: 1, updated: 1, removed: 2, unchanged: 0 });
        assert.deepInclude(second, { inserted: 0, updated: 0, removed: 0, unchanged: 2 });
        assert.deepEqual(
            store.rows.map(({ name, normalizedName }) => ({ name, normalizedName })),
            [
                { name: "Pacifism", normalizedName: "PACIFISM" },
                { name: "Fireball", normalizedName: "FIREBALL" }
            ]
        );
    });

    it("fails an empty or entirely unmatchable catalog before mutating storage", async () => {
        const upsertName = sinon.stub();
        const removeName = sinon.stub();

        for (const names of [[], ["_____", null]]) {
            let caughtError;
            try {
                await seedCardNames({
                    getCardNames: async () => names,
                    getStoredNames: async () => [{ _id: "1", name: "Pacifism" }],
                    upsertName,
                    removeName,
                    logger: { log: sinon.stub() }
                });
            } catch (error) {
                caughtError = error;
            }
            assert.equal(
                caughtError?.message,
                "Scryfall card-name catalog contains no matchable names"
            );
        }
        assert.isFalse(upsertName.called);
        assert.isFalse(removeName.called);
    });

    it("rejects a malformed Scryfall response", async () => {
        let caughtError;

        try {
            await seedCardNames({
                getCardNames: async () => null,
                getStoredNames: sinon.stub(),
                upsertName: sinon.stub(),
                removeName: sinon.stub(),
                logger: { log: sinon.stub() }
            });
        } catch (error) {
            caughtError = error;
        }

        assert.instanceOf(caughtError, Error);
        assert.equal(caughtError.message, "Scryfall card-name response must be an array");
    });
});
