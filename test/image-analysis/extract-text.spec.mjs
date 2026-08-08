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

    it("reuses one worker while resetting adaptive OCR state between images", async () => {
        const worker = {
            load: sandbox.stub().resolves(),
            loadLanguage: sandbox.stub().resolves(),
            initialize: sandbox.stub().resolves(),
            recognize: sandbox.stub().resolves({ data: { text: "Pacifism" } }),
            terminate: sandbox.stub().resolves()
        };
        const createWorkerStub = sandbox
            .stub(textExtraction.dependencies.Tesseract, "createWorker")
            .returns(worker);

        const session = await textExtraction.createOcrSession({
            cacheMethod: "none",
            langPath: "/fixtures",
            gzip: false
        });
        await session.recognize("/tmp/first.jpg", { region: "name-core" });
        await session.recognize("/tmp/second.jpg", { region: "name-wide" });
        await session.terminate();

        assert.isTrue(createWorkerStub.calledOnce);
        assert.include(createWorkerStub.firstCall.args[0], {
            cacheMethod: "none",
            langPath: "/fixtures",
            gzip: false
        });
        sinon.assert.callOrder(worker.load, worker.loadLanguage, worker.initialize);
        assert.isTrue(worker.loadLanguage.calledOnceWithExactly("eng"));
        assert.equal(worker.initialize.callCount, 2);
        assert.isTrue(worker.initialize.alwaysCalledWithExactly("eng"));
        assert.deepEqual(worker.recognize.args, [["/tmp/first.jpg"], ["/tmp/second.jpg"]]);
        assert.isBelow(worker.recognize.firstCall.callId, worker.initialize.secondCall.callId);
        assert.isBelow(worker.initialize.secondCall.callId, worker.recognize.secondCall.callId);
        assert.isTrue(worker.terminate.calledOnce);
    });

    it("uses an injected OCR session for every prepared variant", async () => {
        const session = {
            recognize: sandbox.stub().resolves({
                data: { text: "Thought Reflection", confidence: 80 }
            })
        };
        const oneShotRecognize = sandbox.stub(textExtraction.dependencies.Tesseract, "recognize");
        const variants = [
            { buffer: Buffer.from("a"), region: "name-core", psm: "line" },
            { buffer: Buffer.from("b"), region: "name-wide", psm: "line" }
        ];

        const result = await new Promise((resolve, reject) => {
            textExtraction.ScanImage(
                variants,
                "name",
                (err, extracted) => (err ? reject(err) : resolve(extracted)),
                { session }
            );
        });

        assert.equal(result.cleanText, "THOUGHT REFLECTION");
        assert.isTrue(session.recognize.calledTwice);
        assert.equal(session.recognize.firstCall.args[1].region, "name-core");
        assert.equal(session.recognize.secondCall.args[1].region, "name-wide");
        assert.isTrue(oneShotRecognize.notCalled);
    });

    it("terminates a worker when OCR session initialization fails", async () => {
        const expectedError = new Error("language initialization failed");
        const worker = {
            load: sandbox.stub().resolves(),
            loadLanguage: sandbox.stub().rejects(expectedError),
            initialize: sandbox.stub().resolves(),
            terminate: sandbox.stub().resolves()
        };
        sandbox.stub(textExtraction.dependencies.Tesseract, "createWorker").returns(worker);

        let actualError;
        try {
            await textExtraction.createOcrSession({ cacheMethod: "none" });
        } catch (err) {
            actualError = err;
        }

        assert.strictEqual(actualError, expectedError);
        assert.isTrue(worker.terminate.calledOnce);
        assert.isTrue(worker.initialize.notCalled);
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
});
