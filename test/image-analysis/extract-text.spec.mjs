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
            assert.equal(recognizeStub.firstCall.args[2].cacheMethod, "readOnly");
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

    it("allows regression runs to disable the OCR cache and use a local language model", (done) => {
        const recognizeStub = sandbox
            .stub(textExtraction.dependencies.Tesseract, "recognize")
            .resolves({ data: { text: "Pacifism" } });

        textExtraction.ScanImage(
            "/tmp/fake-image.jpg",
            "name",
            (err) => {
                assert.isNull(err);
                assert.include(recognizeStub.firstCall.args[2], {
                    cacheMethod: "none",
                    langPath: "/fixtures",
                    gzip: false
                });
                done();
            },
            { cacheMethod: "none", langPath: "/fixtures", gzip: false }
        );
    });

    it("prefers plausible name text over a slightly higher-confidence noisy crop", () => {
        const candidates = [
            {
                region: "name-core",
                cleanText: "ORNITHOGTER",
                dirtyText: "Ornithogter\n",
                confidence: 59
            },
            {
                region: "name-wide",
                cleanText: "M W",
                dirtyText: "m—W\n",
                confidence: 55
            },
            {
                region: "top-band",
                cleanText: "I ORNITHO LER Q XI 5 4 L'L I",
                dirtyText: "i Ornitho . ler Q\n-. xi! 5 4.; \\l'l: I!\n",
                confidence: 65
            }
        ];

        const best = textExtraction.selectBestResult(candidates, "name");

        assert.equal(best.region, "name-core");
        assert.equal(best.cleanText, "ORNITHOGTER");
        assert.isAbove(
            textExtraction.scoreOcrCandidate(best, "name"),
            textExtraction.scoreOcrCandidate(candidates[2], "name")
        );
    });
});
