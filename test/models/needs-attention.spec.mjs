import { assert } from "chai";
import sinon from "sinon";
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
        const insertStub = sandbox.stub().resolves({ _id: "abc" });

        const model = NeedsAttention.create({
            cardName: "Pacifism",
            extractedText: "clean",
            dirtyExtractedText: "dirty",
            nameImage: "base64==",
            possibleSets: "M20,M21",
            dependencies: { insert: insertStub }
        });

        const result = await model.insert();

        assert.deepEqual(result, { _id: "abc" });
        assert.isTrue(insertStub.calledOnce);
        assert.equal(insertStub.firstCall.args[0].cardName, "Pacifism");
    });

    it("Insert() rejects when the persistence tier rejects", async () => {
        const insertStub = sandbox.stub().rejects(new Error("write failed"));

        const model = NeedsAttention.create({
            cardName: "Pacifism",
            extractedText: "clean",
            dirtyExtractedText: "dirty",
            nameImage: "base64==",
            possibleSets: "M20,M21",
            dependencies: { insert: insertStub }
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
