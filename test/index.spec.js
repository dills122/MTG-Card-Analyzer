const path = require("path");
const { assert } = require("chai");
const sinon = require("sinon");
const proxyquire = require("proxyquire").noCallThru();

describe("CLI::index.js", () => {
    let sandbox;
    let consoleLogStub;
    let processExitStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        consoleLogStub = sandbox.stub(console, "log");
        processExitStub = sandbox.stub(process, "exit");
    });

    afterEach(() => {
        sandbox.restore();
        delete require.cache[require.resolve(path.resolve(__dirname, "..", "index.js"))];
    });

    function loadIndexWith(cliReturnOverrides = {}, fsAccessImpl) {
        const meowStub = sandbox.stub().returns(
            Object.assign(
                {
                    input: [],
                    flags: {}
                },
                cliReturnOverrides
            )
        );

        const fsStub = {
            access: fsAccessImpl
                ? fsAccessImpl
                : (_path, cb) => {
                      // mimic async fs.access success
                      setImmediate(() => cb(null));
                  }
        };

        const executeStub = sandbox.stub().callsFake((cb) => cb && cb());
        const processorCreateStub = sandbox.stub().returns({
            execute: executeStub
        });

        proxyquire(path.resolve(__dirname, "..", "index.js"), {
            meow: meowStub,
            fs: fsStub,
            "./src/processor/index": { Processor: { create: processorCreateStub } }
        });

        return { meowStub, executeStub, processorCreateStub };
    }

    it("prints help when no command provided", () => {
        loadIndexWith();
        assert.isTrue(consoleLogStub.calledWith("Try running --help for more info"));
        assert.isFalse(processExitStub.called);
    });

    it("prints error for unknown command", () => {
        loadIndexWith({ input: ["unknown"] });
        assert.isTrue(consoleLogStub.calledWith("Command not found"));
        assert.isFalse(processExitStub.called);
    });

    it("invokes Processor for scan command with defaults and exits", async () => {
        const { processorCreateStub, executeStub } = loadIndexWith({
            input: ["scan", "./some-path.jpg"],
            flags: { q: false, query: false, p: true, pretty: true }
        });

        // wait a tick for the async fs.access -> then chain
        await new Promise((resolve) => setImmediate(resolve));

        assert.isTrue(processorCreateStub.calledOnce);
        assert.deepInclude(processorCreateStub.firstCall.args[0], {
            filePath: "./some-path.jpg",
            queryingEnabled: false,
            isPretty: true
        });
        assert.isTrue(executeStub.calledOnce);
        assert.isTrue(processExitStub.calledWith(0));
    });
});
