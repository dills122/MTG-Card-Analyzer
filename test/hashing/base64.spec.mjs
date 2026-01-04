import { assert } from "chai";
import Base64 from "../../src/image-hashing/base64-img.mjs";
import sinon from "sinon";

describe("Base64::", () => {
    let stubs = {};
    describe("StringfyImagesNDAtn::", () => {
        const base64Str = "QVNGRERTRlNBRkFTREZTREZTREZTRg==";
        beforeEach(() => {
            stubs.base64Stub = sinon.stub(Base64.dependencies, "base64Img").resolves(base64Str);
        });
        afterEach(() => {
            sinon.restore();
        });
        it("Should return a hash of the image", (done) => {
            Base64.StringfyImagesNDAtn({
                flavorImage: "",
                artImage: "",
                typeImage: "",
                nameImage: ""
            })
                .then((base64Imgs) => {
                    assert.isObject(base64Imgs);
                    assert.deepEqual(base64Imgs.nameImage, base64Str);
                    assert.deepEqual(base64Imgs.typeImage, base64Str);
                    assert.deepEqual(base64Imgs.flavorImage, base64Str);
                    assert.deepEqual(base64Imgs.artImage, base64Str);
                    assert.equal(stubs.base64Stub.callCount, 4);
                    done();
                })
                .catch((error) => {
                    done(error);
                });
        });
    });
});
