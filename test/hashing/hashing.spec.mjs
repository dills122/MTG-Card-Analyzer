import { assert } from "chai";
import sinon from "sinon";
import { createHashing } from "../../src/image-hashing/hash-image.mjs";

describe("Hashing::", () => {
    const url = "https://img.scryfall.com/cards/normal/en/shm/53.jpg?1517813031";
    const fakeFingerprint = {
        schemaVersion: 1,
        algorithm: "pdq-v1",
        encoding: "hex",
        hash: "0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0",
        bitLength: 256,
        quality: 100
    };
    let Hashing;
    let fingerprintImageStub;
    let loadImageInputStub;
    describe("ImageHashing::", () => {
        beforeEach(() => {
            fingerprintImageStub = sinon.stub().resolves(fakeFingerprint);
            loadImageInputStub = sinon.stub().resolves({
                buffer: Buffer.from("validated image"),
                dimensions: { width: 10, height: 10, format: "jpeg" }
            });
            Hashing = createHashing({
                fingerprintImage: fingerprintImageStub,
                loadImageInput: loadImageInputStub
            });
        });
        afterEach(() => {
            sinon.restore();
        });
        it("Should return a hash of the image", (done) => {
            const consoleLogStub = sinon.stub(console, "log");
            Hashing.hashImage(url, (error, hash) => {
                assert.isNull(error);
                assert.isString(hash);
                assert.equal(JSON.parse(hash).algorithm, "pdq-v1");
                assert.isTrue(fingerprintImageStub.calledOnce, "Image fingerprint called");
                assert.isTrue(
                    consoleLogStub.calledOnceWithExactly(
                        "INFO  Fingerprinting image: img.scryfall.com/53.jpg (PDQ v1)"
                    )
                );
                done();
            });
        });

        it("Should return an error", (done) => {
            loadImageInputStub.rejects({});
            Hashing.hashImage("", (error, hash) => {
                assert.deepEqual(error, {});
                assert.isUndefined(hash);
                assert.isFalse(fingerprintImageStub.called, "Image fingerprint not called");
                done();
            });
        });

        it("does not let a malformed remote URL break hashing", (done) => {
            const consoleLogStub = sinon.stub(console, "log");
            loadImageInputStub.rejects(
                new Error("Invalid or unsupported image: remote URL is invalid")
            );

            Hashing.hashImage("http://%", (error, hash) => {
                assert.match(error.message, /remote URL is invalid/);
                assert.isUndefined(hash);
                assert.isTrue(
                    consoleLogStub.calledOnceWithExactly(
                        "INFO  Fingerprinting image: invalid URL (PDQ v1)"
                    )
                );
                done();
            });
        });
    });
    describe("HashComparison::", () => {
        const hashOne = "0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0";
        const hashTwo = "0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0";
        afterEach(() => {
            sinon.restore();
        });
        beforeEach(() => {
            Hashing = createHashing();
        });
        it("Should return a hash comparison result", (done) => {
            const consoleLogStub = sinon.stub(console, "log");
            let hashComparisonResults = Hashing.compareHash(hashOne, hashTwo);
            assert.isObject(hashComparisonResults);
            assert.equal(hashComparisonResults.similarity, 1);
            assert.equal(hashComparisonResults.distance, 0);
            assert.isTrue(
                consoleLogStub.calledOnceWithExactly(
                    "INFO  Fingerprint similarity: 100% (distance 0/256, minimum quality n/a)"
                )
            );
            done();
        });
    });
});
