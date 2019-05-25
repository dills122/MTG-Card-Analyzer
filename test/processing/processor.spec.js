const chai = require('chai');
const assert = require('assert');
const processor = require('../../src/processor/processor');
const path = require('path');
const appRoot = require('app-root-path');

describe("Processor::", () => {
    beforeEach(() => {

    });
    afterEach(() => {

    });
    describe("ProcessImage::", () => {
        it("Should process single image", (done) => {
            const filePath = path.join(appRoot.toString(),'src/test-images/PlatinumAngel.jpg');
            let imgProcessor = processor.create({
                filePath: filePath
            });
            imgProcessor.execute((err) => {
                assert.equal(imgProcessor.filePath, filePath);
                chai.assert.isAbove(imgProcessor.nameMatches[0][0], .65);
                chai.assert.deepEqual(imgProcessor.nameMatches[0][1], 'Platinum Angel');
                chai.assert.isAbove(imgProcessor.typeMatches[0][0], .75);
                chai.assert.deepEqual(imgProcessor.typeMatches[0][1], 'Creature');
                done(err);
            });
        }).timeout(5000);
        it("Should throw to small error", (done) => {
            const filePath = path.join(appRoot.toString(),'src/test-images/test-extractions/93e73461-807b-4590-9171-c3759a2576e9.jpg');
            let imgProcessor = processor.create({
                filePath: filePath
            });
            imgProcessor.execute((err) => {
                //Error throwing not bubbling up
                assert.equal(imgProcessor.filePath, filePath);
                chai.assert.isNull(imgProcessor.nameMatches);
                assert.deepEqual(imgProcessor.typeMatches, []);
                done(err);
            });
        });
    });
}).timeout(10000);