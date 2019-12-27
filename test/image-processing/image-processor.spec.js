const {
    assert,
    expect
} = require("chai");
const sinon = require("sinon");
const ImageProcessor = require("../../src/image-processing").ImageProcessor;
const resize = require("../../src/image-processing/").resize;
const textExtraction = require("../../src/image-analysis/").textExtraction;

const FAKE_PATH = "./to/fake.img";
const FAKE_PATH_INPUT = "/input/to/fake.img";
const FAKE_DIR = "./DIR";
const TYPE = "name";
const FAKE_EXTRACTION = {
    cleanText: 'MTG Card',
    dirtyText: '$ MTG Card'
};

describe("Integration::", () => {
    describe("ImageProcessor::", () => {
        let sandbox = sinon.createSandbox();
        let stubs = {};

        beforeEach(() => {
            stubs.resizeStub = sandbox.stub(resize, "GetImageSnippetTmpFile").resolves(FAKE_PATH);
            stubs.textExtractionStub = sandbox.stub(textExtraction, "ScanImage").callsArgWith(1, null, FAKE_EXTRACTION);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it("Should execute happy path and return extraction results", (done) => {
            let processor = ImageProcessor.create({
                path: FAKE_PATH_INPUT,
                type: TYPE,
                directory: FAKE_DIR
            });

            processor.extract((err) => {
                assert.isTrue(stubs.resizeStub.calledOnce);
                assert.isTrue(stubs.textExtractionStub.calledOnce);
                assert.deepEqual(processor.results, FAKE_EXTRACTION);
                return done(err);
            })
        });

        it("Should error out due to an incomplete schema", (done) => {
            let processor = () => ImageProcessor.create({});
            assert.throw(processor, Error);
            return done();
        });
    });
});