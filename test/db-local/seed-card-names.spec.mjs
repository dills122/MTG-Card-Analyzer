import { assert } from "chai";
import sinon from "sinon";
import { seedCardNames } from "../../src/db-local/seed-card-names.mjs";

describe("db-local::seed-card-names", () => {
    it("inserts every name with bounded concurrency and summary output", async () => {
        let active = 0;
        let maxActive = 0;
        const inserted = [];
        const logger = { log: sinon.stub() };
        const insertName = async (name) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setImmediate(resolve));
            inserted.push(name);
            active -= 1;
        };

        const result = await seedCardNames({
            getCardNames: async () => ["Pacifism", "Fireball", "Unsummon", "Shivan Dragon"],
            insertName,
            logger,
            concurrency: 2
        });

        assert.sameMembers(inserted, ["Pacifism", "Fireball", "Unsummon", "Shivan Dragon"]);
        assert.equal(maxActive, 2);
        assert.deepEqual(result, { inserted: 4 });
        assert.deepEqual(
            logger.log.getCalls().map((call) => call.args[0]),
            ["Seeding 4 card names...", "Seeded 4 card names."]
        );
    });

    it("handles an empty Scryfall response without starting inserts", async () => {
        const insertName = sinon.stub();
        const logger = { log: sinon.stub() };

        const result = await seedCardNames({
            getCardNames: async () => [],
            insertName,
            logger
        });

        assert.deepEqual(result, { inserted: 0 });
        assert.isFalse(insertName.called);
        assert.isTrue(logger.log.calledOnceWithExactly("No card names returned; nothing to seed."));
    });

    it("rejects a malformed Scryfall response", async () => {
        let caughtError;

        try {
            await seedCardNames({
                getCardNames: async () => null,
                insertName: sinon.stub(),
                logger: { log: sinon.stub() }
            });
        } catch (error) {
            caughtError = error;
        }

        assert.instanceOf(caughtError, Error);
        assert.equal(caughtError.message, "Scryfall card-name response must be an array");
    });

    it("rejects malformed card names before writing", async () => {
        const insertName = sinon.stub();
        let caughtError;

        try {
            await seedCardNames({
                getCardNames: async () => ["Pacifism", ""],
                insertName,
                logger: { log: sinon.stub() }
            });
        } catch (error) {
            caughtError = error;
        }

        assert.equal(caughtError.message, "Scryfall card names must be non-empty strings");
        assert.isFalse(insertName.called);
    });
});
