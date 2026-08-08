import { assert } from "chai";
import sinon from "sinon";
import storage from "../../src/storage/index.mjs";
import NeedsAttention from "../../src/models/needs-attention.mjs";

describe("models::needs-attention", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("Insert() routes through storage.needsAttention.insert (the pluggable persistence tier)", async () => {
        const insertStub = sandbox.stub(storage.needsAttention, "insert").resolves({ _id: "abc" });

        const model = NeedsAttention.create({
            cardName: "Pacifism",
            extractedText: "clean",
            dirtyExtractedText: "dirty",
            nameImage: "base64==",
            possibleSets: "M20,M21"
        });

        const result = await model.insert();

        assert.deepEqual(result, { _id: "abc" });
        assert.isTrue(insertStub.calledOnce);
        assert.equal(insertStub.firstCall.args[0].cardName, "Pacifism");
    });

    it("Insert() rejects when the persistence tier rejects", async () => {
        sandbox.stub(storage.needsAttention, "insert").rejects(new Error("write failed"));

        const model = NeedsAttention.create({
            cardName: "Pacifism",
            extractedText: "clean",
            dirtyExtractedText: "dirty",
            nameImage: "base64==",
            possibleSets: "M20,M21"
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
