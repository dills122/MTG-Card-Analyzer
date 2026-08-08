import { assert } from "chai";
import sinon from "sinon";
import { Logger } from "../../src/logger/log.mjs";

describe("Logger", () => {
    let sink;

    beforeEach(() => {
        sink = {
            log: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub()
        };
    });

    it("renders pretty info messages without Bunyan process metadata", () => {
        const logger = new Logger({ isPretty: true, colors: false, sink });

        logger.info("Creating work directory");

        assert.isTrue(sink.log.calledOnceWithExactly("INFO  Creating work directory"));
    });

    it("renders structured details beneath their message", () => {
        const logger = new Logger({ isPretty: true, colors: false, sink });

        logger.info("Hash comparison complete", {
            setName: "Core Set 2020",
            score: 0.98
        });

        assert.isTrue(sink.log.calledOnce);
        const output = sink.log.firstCall.args[0];
        assert.include(output, "INFO  Hash comparison complete");
        assert.include(output, "setName: 'Core Set 2020'");
        assert.notInclude(output, '"hostname"');
        assert.notInclude(output, '"pid"');
    });

    it("prints concise Error messages without stack noise", () => {
        const logger = new Logger({ isPretty: true, colors: false, sink });

        logger.error(new Error("OCR failed"));

        assert.isTrue(sink.error.calledOnceWithExactly("ERROR OCR failed"));
    });

    it("keeps plain mode output unadorned", () => {
        const logger = new Logger({ isPretty: false, sink });

        logger.warn("Cache unavailable", { retry: false });

        assert.isTrue(sink.warn.firstCall.calledWithExactly("Cache unavailable"));
        assert.isTrue(sink.warn.secondCall.calledWithExactly('{\n    "retry": false\n}'));
    });

    it("prints user-facing output without a log-level prefix", () => {
        const logger = new Logger({ isPretty: true, colors: false, sink });

        logger.output("Scan results\n\n1. Pacifism");

        assert.isTrue(sink.log.calledOnceWithExactly("Scan results\n\n1. Pacifism"));
    });
});
