import { assert } from "chai";
import sinon from "sinon";
import { buildFileIO } from "../src/file-io.mjs";

describe("File IO helpers", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("writes to a random json file when no path supplied", async () => {
        const writeStub = sandbox.stub().resolves();
        const randomUUID = sandbox.stub().returns("uuid-123");
        const { WriteToFile } = buildFileIO({
            fs: { writeFile: writeStub, unlink: () => {}, mkdir: () => {} },
            promisify: () => writeStub,
            randomUUID,
            tempDirectory: "/tmp/mock",
            rimrafLib: () => {}
        });

        await WriteToFile({ hello: "world" });

        assert.isTrue(writeStub.calledOnce);
        const filename = writeStub.firstCall.args[0];
        assert.match(filename, /uuid-123\.json$/);
    });

    it("creates a directory under tmpdir using randomUUID", (done) => {
        const mkdirStub = sandbox.stub().callsArgWith(1, null);
        const randomUUID = sandbox.stub().returns("uuid-abc");
        const { CreateDirectory } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: mkdirStub },
            promisify: (fn) => fn,
            randomUUID,
            tempDirectory: "/tmp/mock",
            rimrafLib: () => {}
        });

        CreateDirectory((err, dirPath) => {
            assert.isNull(err);
            assert.equal(dirPath, "/tmp/mock/uuid-abc");
            done();
        });
    });

    it("cleans up files via promise-based rimraf", async () => {
        const rimrafStub = sandbox.stub().returns(Promise.resolve());
        const doneSpy = sandbox.spy();
        const { CleanUpFiles } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: () => {} },
            promisify: (fn) => fn,
            randomUUID: () => "id",
            tempDirectory: "/tmp/mock",
            rimrafLib: rimrafStub
        });

        CleanUpFiles("/tmp/mock/dir", doneSpy);
        await new Promise((resolve) => setImmediate(resolve));
        assert.isTrue(rimrafStub.calledOnce);
        assert.isTrue(doneSpy.calledOnceWithExactly());
    });

    it("cleans up files via callback-based rimraf", (done) => {
        function legacyRimraf(_path, cb) {
            cb();
        }
        const doneSpy = sandbox.spy(() => {
            assert.isTrue(doneSpy.calledOnce);
            done();
        });
        const { CleanUpFiles } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: () => {} },
            promisify: (fn) => fn,
            randomUUID: () => "id",
            tempDirectory: "/tmp/mock",
            rimrafLib: legacyRimraf
        });

        CleanUpFiles("/tmp/mock/dir", doneSpy);
    });
});
