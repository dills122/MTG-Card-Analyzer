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
            fs: { writeFile: writeStub, unlink: () => {}, mkdir: () => {}, rm: () => {} },
            promisify: () => writeStub,
            randomUUID,
            tempDirectory: "/tmp/mock"
        });

        await WriteToFile({ hello: "world" });

        assert.isTrue(writeStub.calledOnce);
        const filename = writeStub.firstCall.args[0];
        assert.match(filename, /uuid-123\.json$/);
    });

    it("creates a directory under tmpdir using randomUUID", async () => {
        const mkdirStub = sandbox.stub().resolves();
        const randomUUID = sandbox.stub().returns("uuid-abc");
        const { CreateDirectory } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: mkdirStub, rm: () => {} },
            promisify: (fn) => fn,
            randomUUID,
            tempDirectory: "/tmp/mock"
        });

        const dirPath = await CreateDirectory();
        assert.equal(dirPath, "/tmp/mock/uuid-abc");
        assert.isTrue(mkdirStub.calledOnceWithExactly("/tmp/mock/uuid-abc"));
    });

    it("cleans up files via fs.rm", async () => {
        const rmStub = sandbox.stub().resolves();
        const { CleanUpFiles } = buildFileIO({
            fs: { writeFile: () => {}, unlink: () => {}, mkdir: () => {}, rm: rmStub },
            promisify: (fn) => fn,
            randomUUID: () => "id",
            tempDirectory: "/tmp/mock"
        });

        await CleanUpFiles("/tmp/mock/dir");
        assert.isTrue(
            rmStub.calledOnceWithExactly("/tmp/mock/dir", { recursive: true, force: true })
        );
    });
});
