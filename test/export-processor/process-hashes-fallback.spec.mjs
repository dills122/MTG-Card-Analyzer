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
            comparable: true,
            matches: false,
            similarity: 0.65,
            minQuality: 100,
            distance: 90
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
                    hashImage: hashImageStub,
                    compareHash: compareHashStub
                },
                CardHashes: {
                    getByCardName: sandbox.stub().resolves([]),
                    upsert: sandbox.stub().returns()
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
