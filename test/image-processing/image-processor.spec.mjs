import { assert } from "chai";
import sinon from "sinon";
import imageProcessing from "../../src/image-processing/index.mjs";
const { ImageProcessor } = imageProcessing;

const FAKE_PATH = "./to/fake.img";
const FAKE_PATH_INPUT = "/input/to/fake.img";
const FAKE_DIR = "./DIR";
const TYPE = "name";
const FAKE_EXTRACTION = {
    cleanText: "MTG Card",
    dirtyText: "$ MTG Card"
};

describe("Integration::", () => {
    describe("ImageProcessor::", () => {
        let sandbox = sinon.createSandbox();
        let stubs = {};

        beforeEach(() => {
            stubs.preprocessStub = sandbox.stub().resolves({
                variants: [{ buffer: Buffer.from("OCR"), region: TYPE, psm: "line" }],
                previewPath: FAKE_PATH
            });
            stubs.textExtractionStub = sandbox.stub().callsArgWith(2, null, FAKE_EXTRACTION);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it("Should execute happy path and return extraction results", (done) => {
            let processor = ImageProcessor.create({
                path: FAKE_PATH_INPUT,
                type: TYPE,
                directory: FAKE_DIR,
                dependencies: {
                    ocrPreprocessor: { prepareOcrVariants: stubs.preprocessStub },
                    textExtraction: { ScanImage: stubs.textExtractionStub }
                }
            });

            processor.extract((err) => {
                assert.isTrue(stubs.preprocessStub.calledOnce);
                assert.isTrue(stubs.textExtractionStub.calledOnce);
                assert.deepEqual(processor.results, FAKE_EXTRACTION);
                return done(err);
            });
        });

        it("Should error out due to an incomplete schema", (done) => {
            let processor = () => ImageProcessor.create({});
            assert.throw(processor, Error);
            return done();
        });
    });
});
