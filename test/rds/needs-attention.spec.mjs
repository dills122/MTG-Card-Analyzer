import { assert } from "chai";
import sinon from "sinon";
import mysql from "mysql2";
import { InsertRecord } from "../../src/rds/needs-attention.mjs";

describe("rds::needs-attention", () => {
    let sandbox;
    let fakeConnection;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        fakeConnection = {
            connect: sandbox.stub().callsFake((cb) => cb(null)),
            query: sandbox.stub(),
            end: sandbox.stub()
        };
        sandbox.stub(mysql, "createConnection").returns(fakeConnection);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("InsertRecord targets the NeedsAttention table with parameterized placeholders", (done) => {
        fakeConnection.query.callsFake((sql, params, cb) => cb(null, { insertId: 1 }));

        InsertRecord(
            {
                cardName: "Urza's Tower",
                possibleSets: "M20,M21",
                extractedText: "clean",
                dirtyExtractedText: "dirty",
                nameImage: "base64=="
            },
            (err) => {
                assert.isNull(err);
                const [sql, params] = fakeConnection.query.firstCall.args;
                assert.match(sql, /INSERT INTO NeedsAttention/);
                assert.notInclude(sql, "Urza's Tower");
                assert.deepEqual(params, ["Urza's Tower", "M20,M21", "clean", "dirty", "base64=="]);
                done();
            }
        );
    });
});
