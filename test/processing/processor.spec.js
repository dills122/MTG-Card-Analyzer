const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const assert = require('assert');
const processor = require('../../src/processor/processor');
const path = require('path');
const appRoot = require('app-root-path');
const filePath = path.join(appRoot.toString(),'src\\test-images\\test-extractions\\93e73461-807b-4590-9171-c3759a2576e9.jpg');

describe("Processor::", () => {
    let sandbox = {};
    let stubs = {};
    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });
    afterEach(() => {
        sinon.restore();
    });
    describe("ProcessImage::", () => {
        it("Should throw to small error", (done) => {
            let imgProcessor = processor.create({
                filePath: filePath
            });
            imgProcessor.execute((err) => {
                assert.equal(imgProcessor.filePath, filePath);
                chai.assert.isNull(imgProcessor.nameMatches);
                assert.deepEqual(imgProcessor.typeMatches, []);
                done(err);
            });
        });
    });
});