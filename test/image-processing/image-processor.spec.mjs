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
                    textExtraction: { scanImage: stubs.textExtractionStub }
                }
            });

            processor.extract((err) => {
                assert.isTrue(stubs.preprocessStub.calledOnce);
                assert.isTrue(stubs.textExtractionStub.calledOnce);
                assert.deepEqual(processor.results, FAKE_EXTRACTION);
                return done(err);
            });
        });

        it("disables preview persistence and forwards no-cache OCR options", (done) => {
            const ocrOptions = { cacheMethod: "none", langPath: "/fixtures", gzip: false };
            const processor = ImageProcessor.create({
                path: FAKE_PATH_INPUT,
                type: TYPE,
                directory: FAKE_DIR,
                persistArtifacts: false,
                ocrOptions,
                dependencies: {
                    ocrPreprocessor: { prepareOcrVariants: stubs.preprocessStub },
                    textExtraction: { scanImage: stubs.textExtractionStub }
                }
            });

            processor.extract((err) => {
                assert.isUndefined(stubs.preprocessStub.firstCall.args[2].directory);
                assert.include(stubs.textExtractionStub.firstCall.args[3], ocrOptions);
                done(err);
            });
        });

        it("attaches undersized-source sizing metadata to the results (issue #156)", (done) => {
            const sourceSizing = { upscaleFactor: 1.36, upscaled: true };
            stubs.preprocessStub = sandbox.stub().resolves({
                variants: [{ buffer: Buffer.from("OCR"), region: TYPE, psm: "line" }],
                previewPath: FAKE_PATH,
                sourceSizing
            });
            const processor = ImageProcessor.create({
                path: FAKE_PATH_INPUT,
                type: TYPE,
                directory: FAKE_DIR,
                dependencies: {
                    ocrPreprocessor: { prepareOcrVariants: stubs.preprocessStub },
                    textExtraction: { scanImage: stubs.textExtractionStub }
                }
            });

            processor.extract((err) => {
                assert.deepEqual(processor.results.sourceSizing, sourceSizing);
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
