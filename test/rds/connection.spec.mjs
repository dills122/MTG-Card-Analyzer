import { assert } from "chai";
import sinon from "sinon";
import mysql from "mysql2/promise";
import { createConnection } from "../../src/rds/connection.mjs";

describe("rds::connection", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("does not throw when secure.config.cjs is missing, falls back to empty rds config", () => {
        const fakeConnection = {};
        sandbox.stub(mysql, "createConnection").resolves(fakeConnection);

        assert.doesNotThrow(() => createConnection());
        const [config] = mysql.createConnection.firstCall.args;
        assert.deepEqual(config, {
            host: undefined,
            port: undefined,
            user: undefined,
            password: undefined,
            database: undefined
        });
    });
});
