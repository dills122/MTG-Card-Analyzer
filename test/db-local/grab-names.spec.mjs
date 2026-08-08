import { assert } from "chai";
import sinon from "sinon";
import { GetBulkNames } from "../../src/db-local/grab-names.mjs";

describe("db-local::grab-names", () => {
    it("returns stored names", (done) => {
        const store = {
            find: sinon.stub().callsArgWith(1, null, [{ name: "Pacifism" }])
        };

        GetBulkNames((error, names) => {
            assert.isNull(error);
            assert.deepEqual(names, [{ name: "Pacifism" }]);
            done();
        }, store);
    });

    it("returns an empty array when the store has no documents", (done) => {
        const store = { find: sinon.stub().callsArgWith(1, null, null) };

        GetBulkNames((error, names) => {
            assert.isNull(error);
            assert.deepEqual(names, []);
            done();
        }, store);
    });

    it("forwards storage errors", (done) => {
        const expectedError = new Error("names DB unavailable");
        const store = { find: sinon.stub().callsArgWith(1, expectedError) };

        GetBulkNames((error) => {
            assert.equal(error, expectedError);
            done();
        }, store);
    });
});
