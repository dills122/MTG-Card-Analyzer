import { assert } from "chai";
import sinon from "sinon";
import { createHashing } from "../../src/image-hashing/hash-image.mjs";

describe("Hashing::", () => {
    const url = "https://img.scryfall.com/cards/normal/en/shm/53.jpg?1517813031";
    const fakeHash = "0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0";
    let Hashing;
    let imageHashStub;
    let loadImageInputStub;
    describe("ImageHashing::", () => {
        beforeEach(() => {
            imageHashStub = sinon.stub().callsArgWith(3, null, fakeHash);
            loadImageInputStub = sinon.stub().resolves({
                buffer: Buffer.from("validated image"),
                dimensions: { width: 10, height: 10, format: "jpeg" }
            });
            Hashing = createHashing({
                imageHash: imageHashStub,
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
                assert.isTrue(imageHashStub.calledOnce, "Image Hash called");
                assert.isTrue(
                    consoleLogStub.calledOnceWithExactly(
                        "INFO  Hashing image: img.scryfall.com/53.jpg"
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
                assert.isFalse(imageHashStub.called, "Image Hash not called");
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
                    consoleLogStub.calledOnceWithExactly("INFO  Hashing image: invalid URL")
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
            assert.equal(hashComparisonResults.twoBitMatches, 1);
            assert.equal(hashComparisonResults.fourBitMatches, 1);
            assert.equal(hashComparisonResults.stringCompare, 1);
            assert.isTrue(
                consoleLogStub.calledOnceWithExactly(
                    "INFO  Hash similarity: 2-bit 100%, 4-bit 100%, text 100%"
                )
            );
            done();
        });
    });
});
