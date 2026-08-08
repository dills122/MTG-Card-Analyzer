import { assert } from "chai";
import sinon from "sinon";
import mysql from "mysql2/promise";
import {
    getQuantity,
    insertRecord,
    upsertRecord,
    setQuantity,
    deleteRecord
} from "../../src/rds/collection.mjs";

describe("rds::collection", () => {
    let sandbox;
    let fakeConnection;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        fakeConnection = {
            query: sandbox.stub(),
            end: sandbox.stub().resolves()
        };
        sandbox.stub(mysql, "createConnection").resolves(fakeConnection);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("getQuantity uses parameterized placeholders, not string interpolation", async () => {
        fakeConnection.query.resolves([[{ quantity: 3 }]]);

        const quantity = await getQuantity("Urza's Tower", "M20");

        assert.equal(quantity, 3);
        const [sql, params] = fakeConnection.query.firstCall.args;
        assert.notInclude(sql, "Urza's Tower", "card name must not be interpolated into SQL");
        assert.match(sql, /WHERE cardName=\? AND cardSet=\? LIMIT 1/);
        assert.deepEqual(params, ["Urza's Tower", "M20"]);
    });

    it("insertRecord uses parameterized placeholders, not string interpolation", async () => {
        fakeConnection.query.resolves([{ insertId: 1 }]);

        await insertRecord({ cardName: "Urza's Tower", cardSet: "M20", quantity: 2 });

        const [sql, params] = fakeConnection.query.firstCall.args;
        assert.notInclude(sql, "Urza's Tower", "card name must not be interpolated into SQL");
        assert.match(sql, /VALUES \(\?, \?, \?\)/);
        assert.deepEqual(params, ["Urza's Tower", "M20", 2]);
    });

    it("upsertRecord uses parameterized placeholders and MySQL's native ON DUPLICATE KEY UPDATE", async () => {
        fakeConnection.query.resolves([{ affectedRows: 1 }]);

        await upsertRecord({
            cardName: "Urza's Tower",
            cardType: "Land",
            cardSet: "M20",
            priceUsd: 2.5,
            automated: true,
            magicId: 123,
            imageUrl: "https://example.com/p.png"
        });

        const [sql, params] = fakeConnection.query.firstCall.args;
        assert.notInclude(sql, "Urza's Tower", "card name must not be interpolated into SQL");
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
    });

    it("upsertRecord defaults estValue to VALUES(estValue) when priceUsd is not given", async () => {
        fakeConnection.query.resolves([{ affectedRows: 1 }]);

        await upsertRecord({
            cardName: "Urza's Tower",
            cardType: "Land",
            cardSet: "M20",
            estValue: 9.99,
            automated: true,
            magicId: 123,
            imageUrl: "https://example.com/p.png"
        });

        const [, params] = fakeConnection.query.firstCall.args;
        // priceUsd params (last two) are null -- IF() falls through to VALUES(estValue)
        assert.equal(params[4], 9.99, "insert-path estValue falls back to record.estValue");
        assert.isNull(params[8]);
        assert.isNull(params[9]);
    });

    describe("setQuantity", () => {
        it("assigns estValue before quantity in the SET list (order matters -- see comment in source)", async () => {
            fakeConnection.query.resolves([{ affectedRows: 1 }]);

            await setQuantity("Urza's Tower", "M20", 10);

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
        });

        it("errors when no row matched (affectedRows === 0)", async () => {
            fakeConnection.query.resolves([{ affectedRows: 0 }]);

            let caught;
            try {
                await setQuantity("Nonexistent", "XYZ", 5);
            } catch (err) {
                caught = err;
            }
            assert.instanceOf(caught, Error);
            assert.match(caught.message, /No collection entry/);
        });
    });

    describe("deleteRecord", () => {
        it("selects with explicit camelCase aliases (not SELECT *, which returns PascalCase column names)", async () => {
            const row = { cardName: "Urza's Tower", cardSet: "M20", quantity: 2 };
            fakeConnection.query.onFirstCall().resolves([[row]]);
            fakeConnection.query.onSecondCall().resolves([{}]);

            const removed = await deleteRecord("Urza's Tower", "M20");

            assert.deepEqual(removed, row);
            const [selectSql] = fakeConnection.query.firstCall.args;
            assert.notMatch(selectSql, /SELECT \*/);
            const [deleteSql] = fakeConnection.query.secondCall.args;
            assert.match(deleteSql, /^DELETE FROM CardCollection/);
        });

        it("returns null (no error) when nothing matches", async () => {
            fakeConnection.query.resolves([[]]);

            const removed = await deleteRecord("Nonexistent", "XYZ");

            assert.isNull(removed);
            assert.isTrue(
                fakeConnection.query.calledOnce,
                "should not issue a DELETE when nothing was found"
            );
        });
    });
});
