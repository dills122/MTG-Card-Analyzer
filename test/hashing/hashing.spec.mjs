import { assert } from "chai";
import sinon from "sinon";
import Hashing from "../../src/image-hashing/hash-image.js";

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
            Hashing.HashImage(url, (error, hash) => {
                assert.isNull(error);
                assert.isString(hash);
                assert.isTrue(stubs.imageHashStub.calledOnce, "Image Hash called");
                done();
            });
        });

        it("Should return an error", (done) => {
            stubs.imageHashStub.restore();
            stubs.imageHashStub = sinon
                .stub(Hashing.dependencies, "imageHash")
                .callsArgWith(3, {}, null);
            Hashing.HashImage("", (error, hash) => {
                assert.deepEqual(error, {});
                assert.isUndefined(hash);
                assert.isTrue(stubs.imageHashStub.calledOnce, "Image Hash called");
                done();
            });
        });
    });
    describe("HashComparison::", () => {
        const hashOne = "0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0";
        const hashTwo = "0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0";
        it("Should return a hash comparison result", (done) => {
            let hashComparisonResults = Hashing.CompareHash(hashOne, hashTwo);
            assert.isObject(hashComparisonResults);
            assert.equal(hashComparisonResults.twoBitMatches, 1);
            assert.equal(hashComparisonResults.fourBitMatches, 1);
            assert.equal(hashComparisonResults.stringCompare, 1);
            done();
        });
    });
});
