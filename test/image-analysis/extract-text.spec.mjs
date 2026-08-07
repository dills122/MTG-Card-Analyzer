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

    it("normalizes ligatures/diacritics and drops noisy tokens for name extraction", (done) => {
        const recognizeStub = sandbox
            .stub(textExtraction.dependencies.Tesseract, "recognize")
            .resolves({
                data: {
                    text: "m\nThought Reﬂection éggg\n‘V' t, ”I“ . . 1 \\\\K‘ 'g‘r .\n",
                    confidence: 53
                }
            });

        textExtraction.ScanImage("/tmp/fake-image.jpg", "name", (err, result) => {
            assert.isNull(err);
            assert.isTrue(recognizeStub.calledOnce);
            assert.equal(result.cleanText, "THOUGHT REFLECTION");
            assert.equal(
                result.dirtyText,
                "m\nThought Reﬂection éggg\n‘V' t, ”I“ . . 1 \\\\K‘ 'g‘r .\n"
            );
            done();
        });
    });

    it("prefers cleaner name candidate over noisier high-confidence band", async () => {
        const recognizeStub = sandbox
            .stub(textExtraction.dependencies.Tesseract, "recognize")
            .onFirstCall()
            .resolves({
                data: {
                    text: "m\nThought Reﬂection éggg\n‘V' t, ”I“ . . 1 \\\\K‘ 'g‘r .\n",
                    confidence: 62
                }
            })
            .onSecondCall()
            .resolves({
                data: {
                    text: "Thought Reflection\n",
                    confidence: 55
                }
            });

        const variants = [
            { buffer: Buffer.from("a"), region: "top-band", psm: "block" },
            { buffer: Buffer.from("b"), region: "name-core", psm: "line" }
        ];
        const result = await new Promise((resolve, reject) => {
            textExtraction.ScanImage(variants, "name", (err, extracted) => {
                if (err) {
                    return reject(err);
                }
                return resolve(extracted);
            });
        });
        assert.isTrue(recognizeStub.calledTwice);
        assert.equal(result.cleanText, "THOUGHT REFLECTION");
        assert.equal(result.bestVariant.region, "name-core");
    });

    it("processes OCR variants sequentially to protect the shared trained-data cache", async () => {
        let resolveFirst;
        const firstResult = new Promise((resolve) => {
            resolveFirst = resolve;
        });
        const recognizeStub = sandbox
            .stub(textExtraction.dependencies.Tesseract, "recognize")
            .onFirstCall()
            .returns(firstResult)
            .onSecondCall()
            .resolves({ data: { text: "Thought Reflection", confidence: 80 } });

        const variants = [
            { buffer: Buffer.from("a"), region: "name-core", psm: "line" },
            { buffer: Buffer.from("b"), region: "name-wide", psm: "line" }
        ];
        const extraction = new Promise((resolve, reject) => {
            textExtraction.ScanImage(variants, "name", (err, result) => {
                if (err) return reject(err);
                return resolve(result);
            });
        });

        await new Promise((resolve) => setImmediate(resolve));
        assert.isTrue(recognizeStub.calledOnce);

        resolveFirst({ data: { text: "Thought Reflection", confidence: 70 } });
        await extraction;
        assert.isTrue(recognizeStub.calledTwice);
    });
});
