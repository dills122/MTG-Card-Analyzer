import { assert } from "chai";
import sinon from "sinon";
import textExtraction from "../../src/image-analysis/extract-text.mjs";

describe("TextExtraction::", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("returns clean and raw OCR text from tesseract recognize", (done) => {
        const recognizeStub = sandbox
            .stub(textExtraction.dependencies.Tesseract, "recognize")
            .resolves({
                data: {
                    text: "  Pacifism!! \n"
                }
            });

        textExtraction.ScanImage("/tmp/fake-image.jpg", "name", (err, result) => {
            assert.isNull(err);
            assert.isTrue(recognizeStub.calledOnce);
            assert.equal(result.cleanText, "PACIFISM");
            assert.equal(result.dirtyText, "  Pacifism!! \n");
            assert.containsAllKeys(result, ["confidence", "bestVariant", "candidates"]);
            done();
        });
    });

    it("returns OCR error when tesseract recognize rejects", (done) => {
        const expectedErr = new Error("OCR failed");
        const recognizeStub = sandbox
            .stub(textExtraction.dependencies.Tesseract, "recognize")
            .rejects(expectedErr);

        textExtraction.ScanImage("/tmp/fake-image.jpg", "name", (err, result) => {
            assert.strictEqual(err, expectedErr);
            assert.isTrue(recognizeStub.calledOnce);
            assert.isNull(result);
            done();
        });
    });
});
