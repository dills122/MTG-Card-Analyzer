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

    it("creates a directory under tmpdir using randomUUID", async () => {
        const mkdirStub = sandbox.stub().callsArgWith(1, null);
        const randomUUID = sandbox.stub().returns("uuid-abc");
        const { CreateDirectory } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: mkdirStub },
            promisify: (fn) => fn,
            randomUUID,
            tempDirectory: "/tmp/mock",
            rimrafLib: () => {}
        });

        const dirPath = await CreateDirectory();
        assert.equal(dirPath, "/tmp/mock/uuid-abc");
    });

    it("creates a directory under tmpdir when used as a promise", async () => {
        const mkdirStub = sandbox.stub().callsArgWith(1, null);
        const randomUUID = sandbox.stub().returns("uuid-prom");
        const { CreateDirectory } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: mkdirStub },
            promisify: (fn) => fn,
            randomUUID,
            tempDirectory: "/tmp/mock",
            rimrafLib: () => {}
        });

        const dirPath = await CreateDirectory();
        assert.equal(dirPath, "/tmp/mock/uuid-prom");
    });

    it("cleans up files via promise-based rimraf", async () => {
        const rimrafStub = sandbox.stub().returns(Promise.resolve());
        const { CleanUpFiles } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: () => {} },
            promisify: (fn) => fn,
            randomUUID: () => "id",
            tempDirectory: "/tmp/mock",
            rimrafLib: rimrafStub
        });

        await CleanUpFiles("/tmp/mock/dir");
        assert.isTrue(rimrafStub.calledOnce);
    });

    it("cleans up files via callback-based rimraf", async () => {
        function legacyRimraf(_path, cb) {
            cb();
        }
        const { CleanUpFiles } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: () => {} },
            promisify: (fn) => fn,
            randomUUID: () => "id",
            tempDirectory: "/tmp/mock",
            rimrafLib: legacyRimraf
        });

        await CleanUpFiles("/tmp/mock/dir");
    });

    it("cleans up files as a promise", async () => {
        const rimrafStub = sandbox.stub().returns(Promise.resolve());
        const { CleanUpFiles } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: () => {} },
            promisify: (fn) => fn,
            randomUUID: () => "id",
            tempDirectory: "/tmp/mock",
            rimrafLib: rimrafStub
        });

        await CleanUpFiles("/tmp/mock/dir");
        assert.isTrue(rimrafStub.calledOnceWithExactly("/tmp/mock/dir"));
    });
});
