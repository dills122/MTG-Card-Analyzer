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

    it("logs one useful OCR progress heartbeat instead of every ten percent", async () => {
        const info = sandbox.stub();
        sandbox
            .stub(textExtraction.dependencies.Tesseract, "recognize")
            .callsFake(async (_buffer, _language, options) => {
                options.logger({ status: "recognizing text", progress: 0.1 });
                options.logger({ status: "recognizing text", progress: 0.5 });
                options.logger({ status: "recognizing text", progress: 1 });
                return { data: { text: "Pacifism\n", confidence: 82 } };
            });

        await new Promise((resolve, reject) => {
            textExtraction.ScanImage(
                [{ buffer: Buffer.from("card"), region: "name-core", psm: "line" }],
                "name",
                (err, result) => (err ? reject(err) : resolve(result)),
                { logger: { info, error: sandbox.stub() } }
            );
        });

        assert.deepEqual(
            info.getCalls().map((call) => call.args[0]),
            [
                "OCR name: 1 region (name-core)",
                "OCR name-core: 50%",
                'OCR name-core: 82% confidence; "Pacifism" -> "PACIFISM"'
            ]
        );
    });
});
