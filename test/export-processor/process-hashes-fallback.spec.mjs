import { assert } from "chai";
import sinon from "sinon";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const proxyquire = require("proxyquire").noCallThru();

describe("ProcessHashes fallback behavior", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("returns best guess when allowRemoteBestGuess is true and thresholds not met", async () => {
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

        const ProcessHashes = proxyquire("../../src/export-processor/process-hashes.js", {
            "../image-hashing": {
                Hash: {
                    HashImage: hashImageStub,
                    CompareHash: compareHashStub
                }
            },
            "../rds": {
                CardHashes: {
                    GetHashes: sandbox.stub().callsArgWith(1, null, [])
                }
            },
            "../logger/log": {
                create: () => ({
                    info: () => {},
                    error: () => {}
                })
            }
        });

        const hasher = ProcessHashes.create({
            cards: [
                { image_uris: { normal: "a" }, set_name: "A" },
                { image_uris: { normal: "b" }, set_name: "B" }
            ],
            localHash: "local",
            name: "Test",
            allowRemoteBestGuess: true
        });

        await new Promise((resolve, reject) => {
            hasher.compareRemoteImages((err, matches) => {
                if (err) {
                    return reject(err);
                }
                assert.isNull(err);
                assert.isTrue(hashImageStub.calledTwice);
                assert.equal(matches.length, 1);
                resolve();
            });
        });
    });
});
