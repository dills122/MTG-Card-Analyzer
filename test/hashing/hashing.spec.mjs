import { assert } from "chai";
import sinon from "sinon";
import Hashing from "../../src/image-hashing/hash-image.mjs";

describe("Hashing::", () => {
    const url = "https://img.scryfall.com/cards/normal/en/shm/53.jpg?1517813031";
    const fakeHash = "0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0";
    let stubs = {};
    describe("ImageHashing::", () => {
        beforeEach(() => {
            stubs.imageHashStub = sinon
                .stub(Hashing.dependencies, "imageHash")
                .callsArgWith(3, null, fakeHash);
        });
        afterEach(() => {
            sinon.restore();
        });
        it("Should return a hash of the image", (done) => {
            const consoleLogStub = sinon.stub(console, "log");
            Hashing.hashImage(url, (error, hash) => {
                assert.isNull(error);
                assert.isString(hash);
                assert.isTrue(stubs.imageHashStub.calledOnce, "Image Hash called");
                assert.isTrue(
                    consoleLogStub.calledOnceWithExactly(
                        "INFO  Hashing image: img.scryfall.com/53.jpg"
                    )
                );
                done();
            });
        });

        it("Should return an error", (done) => {
            stubs.imageHashStub.restore();
            stubs.imageHashStub = sinon
                .stub(Hashing.dependencies, "imageHash")
                .callsArgWith(3, {}, null);
            Hashing.hashImage("", (error, hash) => {
                assert.deepEqual(error, {});
                assert.isUndefined(hash);
                assert.isTrue(stubs.imageHashStub.calledOnce, "Image Hash called");
                done();
            });
        });

        it("does not let a malformed remote URL break hashing", (done) => {
            const consoleLogStub = sinon.stub(console, "log");

            Hashing.hashImage("http://%", (error, hash) => {
                assert.isNull(error);
                assert.equal(hash, fakeHash);
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
