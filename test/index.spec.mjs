import { assert } from "chai";
import sinon from "sinon";
import { run } from "../index.mjs";

describe("CLI::index.mjs", () => {
    let sandbox;
    let consoleLogStub;
    let processExitStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        consoleLogStub = sandbox.stub();
        processExitStub = sandbox.stub();
    });

    afterEach(() => {
        sandbox.restore();
    });

    async function runCli(cliOverrides = {}, accessImpl) {
        const fakeCli = {
            filePath: "",
            flags: {},
            helpRequested: false,
            ...cliOverrides
        };
        const commanderFactory = sandbox.stub().resolves(fakeCli);
        const executeStub = sandbox.stub().callsFake((cb) => cb && cb());
        const processorCreateStub = sandbox.stub().returns({
            execute: executeStub
        });

        const fsAccessStub = accessImpl ? accessImpl : sandbox.stub().resolves();

        await run({
            argv: [],
            commanderFactory,
            fsAccess: fsAccessStub,
            processorFactory: processorCreateStub,
            exit: processExitStub,
            logger: { log: consoleLogStub }
        });

        return { commanderFactory, executeStub, processorCreateStub, fsAccessStub, fakeCli };
    }

    it("prints help when no command provided", async () => {
        await runCli();
        assert.isTrue(consoleLogStub.calledWith("Try running --help for more info"));
        assert.isFalse(processExitStub.called);
    });

    it("prints usage when help is requested", async () => {
        await runCli({ opts: () => ({ help: true }) });
        assert.isTrue(consoleLogStub.called);
        assert.isFalse(processExitStub.called);
    });

    it("invokes Processor for scan command with defaults and exits", async () => {
        const { processorCreateStub, executeStub, fsAccessStub } = await runCli({
            filePath: "./some-path.jpg",
            flags: { q: false, query: false, p: true, pretty: true }
        });

        assert.isTrue(fsAccessStub.calledWith("./some-path.jpg"));
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
