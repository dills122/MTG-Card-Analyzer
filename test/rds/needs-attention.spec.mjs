import { assert } from "chai";
import sinon from "sinon";
import mysql from "mysql2";
import { insertRecord } from "../../src/rds/needs-attention.mjs";

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

    it("insertRecord targets the real Card_NEED_ATTN table with parameterized placeholders", (done) => {
        fakeConnection.query.callsFake((sql, params, cb) => cb(null, { insertId: 1 }));

        insertRecord(
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
                assert.match(sql, /INSERT INTO Card_NEED_ATTN/);
                assert.notInclude(sql, "Urza's Tower");
                assert.deepEqual(params, ["Urza's Tower", "M20,M21", "clean", "dirty", "base64=="]);
                done();
            }
        );
    });
});
