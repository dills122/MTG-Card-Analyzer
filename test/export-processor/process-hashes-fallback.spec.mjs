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
            eligible: true,
            similarity: 0.8,
            minQuality: 100,
            distance: 51
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
        assert.isTrue(matches.every((match) => match.verified === false));
        assert.isTrue(matches.every((match) => match.matchKind === "remote-image-best-guess"));
    });

    for (const example of [
        {
            name: "similarity is below the calibrated floor",
            comparison: {
                comparable: true,
                matches: false,
                eligible: true,
                similarity: 0.74,
                minQuality: 100,
                distance: 67
            }
        },
        {
            name: "PDQ quality is ineligible",
            comparison: {
                comparable: true,
                matches: false,
                eligible: false,
                similarity: 0.99,
                minQuality: 10,
                distance: 2
            }
        }
    ]) {
        it(`withholds fallback candidates when ${example.name}`, async () => {
            const hasher = ProcessHashesModule.create({
                cards: [{ image_uris: { normal: "a" }, set_name: "A" }],
                localHash: "local",
                name: "Test",
                allowRemoteBestGuess: true,
                dependencies: {
                    Hash: {
                        hashImage: sandbox.stub().callsArgWith(1, null, "remote"),
                        compareHash: sandbox.stub().returns(example.comparison)
                    },
                    CardHashes: {
                        getByCardName: sandbox.stub().resolves([]),
                        upsert: sandbox.stub().returns()
                    }
                },
                logger: {
                    info: sandbox.stub(),
                    error: sandbox.stub()
                }
            });

            assert.deepEqual(await hasher.compareRemoteImages(), []);
        });
    }
});
