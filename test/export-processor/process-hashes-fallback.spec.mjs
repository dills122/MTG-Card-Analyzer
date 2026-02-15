import { assert } from "chai";
import sinon from "sinon";
import ProcessHashesModule from "../../src/export-processor/process-hashes.mjs";

describe("ProcessHashes fallback behavior", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("returns ranked fallback candidates when allowRemoteBestGuess is true and thresholds not met", async () => {
        const hashImageStub = sandbox
            .stub()
            .onFirstCall()
            .callsArgWith(1, null, "hash1")
            .onSecondCall()
            .callsArgWith(1, null, "hash2");
        const compareHashStub = sandbox.stub().returns({
            twoBitMatches: 0.6,
            fourBitMatches: 0.5,
            stringCompare: 0.65
        });

        const hasher = ProcessHashesModule.create({
            cards: [
                { image_uris: { normal: "a" }, set_name: "A" },
                { image_uris: { normal: "b" }, set_name: "B" }
            ],
            localHash: "local",
            name: "Test",
            allowRemoteBestGuess: true,
            dependencies: {
                Hash: {
                    HashImage: hashImageStub,
                    CompareHash: compareHashStub
                },
                CardHashes: {
                    GetHashes: sandbox.stub().callsArgWith(1, null, [])
                }
            },
            logger: {
                info: () => {},
                error: () => {}
            }
        });

        const matches = await hasher.compareRemoteImages();
        assert.isTrue(hashImageStub.calledTwice);
        assert.isAtLeast(matches.length, 1);
        assert.isAtMost(matches.length, 2);
    });
});
