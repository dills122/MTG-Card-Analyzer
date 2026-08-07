import { assert } from "chai";
import sinon from "sinon";
import mysql from "mysql2";
import { GetQuantity, InsertRecord } from "../../src/rds/collection.mjs";

describe("rds::collection", () => {
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

    it("GetQuantity uses parameterized placeholders, not string interpolation", (done) => {
        fakeConnection.query.callsFake((sql, params, cb) => cb(null, [{ quantity: 3 }]));

        GetQuantity("Urza's Tower", "M20", (err, quantity) => {
            assert.isNull(err);
            assert.equal(quantity, 3);
            const [sql, params] = fakeConnection.query.firstCall.args;
            assert.notInclude(sql, "Urza's Tower", "card name must not be interpolated into SQL");
            assert.match(sql, /WHERE cardName=\? AND cardSet=\? LIMIT 1/);
            assert.deepEqual(params, ["Urza's Tower", "M20"]);
            done();
        });
    });

    it("InsertRecord uses parameterized placeholders, not string interpolation", (done) => {
        fakeConnection.query.callsFake((sql, params, cb) => cb(null, { insertId: 1 }));

        InsertRecord({ cardName: "Urza's Tower", cardSet: "M20", quantity: 2 }, (err) => {
            assert.isNull(err);
            const [sql, params] = fakeConnection.query.firstCall.args;
            assert.notInclude(sql, "Urza's Tower", "card name must not be interpolated into SQL");
            assert.match(sql, /VALUES \(\?, \?, \?\)/);
            assert.deepEqual(params, ["Urza's Tower", "M20", 2]);
            done();
        });
    });
});
