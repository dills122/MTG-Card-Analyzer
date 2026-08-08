import { assert } from "chai";
import sinon from "sinon";
import mysql from "mysql2";
import {
    GetQuantity,
    InsertRecord,
    UpsertRecord,
    SetQuantity,
    DeleteRecord
} from "../../src/rds/collection.mjs";

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

    it("UpsertRecord uses parameterized placeholders and MySQL's native ON DUPLICATE KEY UPDATE", (done) => {
        fakeConnection.query.callsFake((sql, params, cb) => cb(null, { affectedRows: 1 }));

        UpsertRecord(
            {
                cardName: "Urza's Tower",
                cardType: "Land",
                cardSet: "M20",
                priceUsd: 2.5,
                automated: true,
                magicId: 123,
                imageUrl: "https://example.com/p.png"
            },
            (err) => {
                assert.isNull(err);
                const [sql, params] = fakeConnection.query.firstCall.args;
                assert.notInclude(
                    sql,
                    "Urza's Tower",
                    "card name must not be interpolated into SQL"
                );
                assert.match(sql, /ON DUPLICATE KEY UPDATE/);
                assert.match(sql, /quantity = quantity \+ VALUES\(quantity\)/);
                // delta defaults to 1 when not given
                assert.deepEqual(params, [
                    "Urza's Tower",
                    "Land",
                    "M20",
                    1,
                    2.5,
                    true,
                    123,
                    "https://example.com/p.png",
                    2.5,
                    2.5
                ]);
                done();
            }
        );
    });

    it("UpsertRecord defaults estValue to VALUES(estValue) when priceUsd is not given", (done) => {
        fakeConnection.query.callsFake((sql, params, cb) => cb(null, { affectedRows: 1 }));

        UpsertRecord(
            {
                cardName: "Urza's Tower",
                cardType: "Land",
                cardSet: "M20",
                estValue: 9.99,
                automated: true,
                magicId: 123,
                imageUrl: "https://example.com/p.png"
            },
            (err) => {
                assert.isNull(err);
                const [, params] = fakeConnection.query.firstCall.args;
                // priceUsd params (last two) are null -- IF() falls through to VALUES(estValue)
                assert.equal(params[4], 9.99, "insert-path estValue falls back to record.estValue");
                assert.isNull(params[8]);
                assert.isNull(params[9]);
                done();
            }
        );
    });

    describe("SetQuantity", () => {
        it("assigns estValue before quantity in the SET list (order matters -- see comment in source)", (done) => {
            fakeConnection.query.callsFake((sql, params, cb) => cb(null, { affectedRows: 1 }));

            SetQuantity("Urza's Tower", "M20", 10, (err) => {
                assert.isNull(err);
                const [sql, params] = fakeConnection.query.firstCall.args;
                assert.notInclude(sql, "Urza's Tower");
                const estValueIdx = sql.indexOf("estValue =");
                const quantityIdx = sql.indexOf("quantity = ?");
                assert.isBelow(
                    estValueIdx,
                    quantityIdx,
                    "estValue must be assigned before quantity or it reads the already-updated value"
                );
                assert.deepEqual(params, [10, 10, "Urza's Tower", "M20"]);
                done();
            });
        });

        it("errors when no row matched (affectedRows === 0)", (done) => {
            fakeConnection.query.callsFake((sql, params, cb) => cb(null, { affectedRows: 0 }));

            SetQuantity("Nonexistent", "XYZ", 5, (err) => {
                assert.instanceOf(err, Error);
                assert.match(err.message, /No collection entry/);
                done();
            });
        });
    });

    describe("DeleteRecord", () => {
        it("selects with explicit camelCase aliases (not SELECT *, which returns PascalCase column names)", (done) => {
            const row = { cardName: "Urza's Tower", cardSet: "M20", quantity: 2 };
            fakeConnection.query.onFirstCall().callsFake((sql, params, cb) => cb(null, [row]));
            fakeConnection.query.onSecondCall().callsFake((sql, params, cb) => cb(null, {}));

            DeleteRecord("Urza's Tower", "M20", (err, removed) => {
                assert.isNull(err);
                assert.deepEqual(removed, row);
                const [selectSql] = fakeConnection.query.firstCall.args;
                assert.notMatch(selectSql, /SELECT \*/);
                const [deleteSql] = fakeConnection.query.secondCall.args;
                assert.match(deleteSql, /^DELETE FROM CardCollection/);
                done();
            });
        });

        it("returns null (no error) when nothing matches", (done) => {
            fakeConnection.query.callsFake((sql, params, cb) => cb(null, []));

            DeleteRecord("Nonexistent", "XYZ", (err, removed) => {
                assert.isNull(err);
                assert.isNull(removed);
                assert.isTrue(
                    fakeConnection.query.calledOnce,
                    "should not issue a DELETE when nothing was found"
                );
                done();
            });
        });
    });
});
