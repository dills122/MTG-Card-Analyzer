import { assert } from "chai";
import sinon from "sinon";
import rds from "../../src/rds/index.mjs";
import Collection from "../../src/models/card-collection.mjs";

describe("models::card-collection", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("Insert() routes to rds.Collection.InsertRecord (the method that actually exists)", (done) => {
        const insertStub = sandbox.stub(rds.Collection, "InsertRecord").callsFake((record, cb) => {
            cb(null, { insertId: 1 });
        });

        const model = Collection.create({
            cardName: "Pacifism",
            cardType: "Enchantment",
            cardSet: "M20",
            quantity: 1,
            magicId: 123,
            imageUrl: "https://example.com/pacifism.png"
        });

        model.Insert((err, results) => {
            assert.isNull(err);
            assert.deepEqual(results, { insertId: 1 });
            assert.isTrue(insertStub.calledOnce);
            assert.equal(insertStub.firstCall.args[0].cardName, "Pacifism");
            done();
        });
    });

    it("Insert() forwards errors through the callback instead of swallowing them", (done) => {
        sandbox.stub(rds.Collection, "InsertRecord").callsFake((record, cb) => {
            cb(new Error("connection refused"));
        });

        const model = Collection.create({
            cardName: "Pacifism",
            cardType: "Enchantment",
            cardSet: "M20",
            quantity: 1,
            magicId: 123,
            imageUrl: "https://example.com/pacifism.png"
        });

        model.Insert((err) => {
            assert.instanceOf(err, Error);
            assert.equal(err.message, "connection refused");
            done();
        });
    });
});
