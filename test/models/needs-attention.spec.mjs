import { assert } from "chai";
import sinon from "sinon";
import rds from "../../src/rds/index.mjs";
import NeedsAttention from "../../src/models/needs-attention.mjs";

describe("models::needs-attention", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("Insert() routes to rds.NDAttn.InsertRecord, not rds.Collection", (done) => {
        const ndAttnStub = sandbox.stub(rds.NDAttn, "InsertRecord").callsFake((record, cb) => {
            cb(null, { insertId: 7 });
        });
        const collectionStub = sandbox.stub(rds.Collection, "InsertRecord");

        const model = NeedsAttention.create({
            cardName: "Pacifism",
            extractedText: "clean",
            dirtyExtractedText: "dirty",
            nameImage: "base64==",
            possibleSets: "M20,M21"
        });

        model.Insert((err, results) => {
            assert.isNull(err);
            assert.deepEqual(results, { insertId: 7 });
            assert.isTrue(ndAttnStub.calledOnce, "must call the NeedsAttention rds module");
            assert.isFalse(
                collectionStub.called,
                "must not call the CardCollection rds module -- that was the bug"
            );
            done();
        });
    });

    it("Insert() forwards errors through the callback instead of swallowing them", (done) => {
        sandbox.stub(rds.NDAttn, "InsertRecord").callsFake((record, cb) => {
            cb(new Error("connection refused"));
        });

        const model = NeedsAttention.create({
            cardName: "Pacifism",
            extractedText: "clean",
            dirtyExtractedText: "dirty",
            nameImage: "base64==",
            possibleSets: "M20,M21"
        });

        model.Insert((err) => {
            assert.instanceOf(err, Error);
            assert.equal(err.message, "connection refused");
            done();
        });
    });
});
