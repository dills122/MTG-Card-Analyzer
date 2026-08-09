import { assert } from "chai";
import sinon from "sinon";
import Collection from "../../src/models/card-collection.mjs";

describe("models::card-collection", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("Insert() routes through storage.collection.upsert (the pluggable persistence tier)", async () => {
        const upsertStub = sandbox.stub().resolves({ quantity: 1 });

        const model = Collection.create({
            cardName: "Pacifism",
            cardType: "Enchantment",
            cardSet: "M20",
            priceUsd: 2.5,
            magicId: 123,
            imageUrl: "https://example.com/pacifism.png",
            dependencies: { upsert: upsertStub }
        });

        const result = await model.insert();

        assert.deepEqual(result, { quantity: 1 });
        assert.isTrue(upsertStub.calledOnce);
        const [record] = upsertStub.firstCall.args;
        assert.equal(record.cardName, "Pacifism");
        assert.equal(record.delta, 1, "defaults to adding one copy");
        assert.equal(record.priceUsd, 2.5);
    });

    it("Insert() rejects when the persistence tier rejects", async () => {
        const upsertStub = sandbox.stub().rejects(new Error("write failed"));

        const model = Collection.create({
            cardName: "Pacifism",
            cardType: "Enchantment",
            cardSet: "M20",
            magicId: 123,
            imageUrl: "https://example.com/pacifism.png",
            dependencies: { upsert: upsertStub }
        });

        let caughtError;
        try {
            await model.insert();
        } catch (err) {
            caughtError = err;
        }
        assert.instanceOf(caughtError, Error);
        assert.equal(caughtError.message, "write failed");
    });
});
