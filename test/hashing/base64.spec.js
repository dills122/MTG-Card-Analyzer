const Base64 = require('../../src/image-hashing/base64-img');
const chai = require('chai');
const sinon = require('sinon');

describe('Base64::', () => {
    let stubs = {};
    describe('StringfyImagesNDAtn::', () => {
        const base64Str = 'QVNGRERTRlNBRkFTREZTREZTREZTRg==';
        beforeEach(() => {
            sandbox = sinon.createSandbox();
            stubs.base64Stub = sinon.stub(Base64.dependencies, 'base64Img').resolves(base64Str);
        });
        afterEach(() => {
            sinon.restore();
        });
        it('Should return a hash of the image', (done) => {
            Base64.StringfyImagesNDAtn({
                flavorImage: '',
                artImage: '',
                typeImage: '',
                nameImage: ''
            }).then((base64Imgs) => {
                chai.assert.isObject(base64Imgs);
                chai.assert.deepEqual(base64Imgs.nameImage, base64Str);
                chai.assert.deepEqual(base64Imgs.typeImage, base64Str);
                chai.assert.deepEqual(base64Imgs.flavorImage, base64Str);
                chai.assert.deepEqual(base64Imgs.artImage, base64Str);
                chai.assert.equal(stubs.base64Stub.callCount, 4);
                done();
            }).catch((error) => {
                done(error);
            });
        });
    });
});