import { assert } from "chai";
import sinon from "sinon";
import textExtraction from "../../src/image-analysis/extract-text.mjs";

describe("TextExtraction::", () => {
    let sandbox;
    let worker;
    let createWorkerStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        worker = {
            load: sandbox.stub().resolves(),
            loadLanguage: sandbox.stub().resolves(),
            initialize: sandbox.stub().resolves(),
            recognize: sandbox.stub().resolves({ data: { text: "Pacifism", confidence: 80 } }),
            setParameters: sandbox.stub().resolves(),
            terminate: sandbox.stub().resolves()
        };
        createWorkerStub = sandbox.stub(textExtraction.dependencies.Tesseract, "createWorker");
        createWorkerStub.returns(worker);
    });

    afterEach(async () => {
        await textExtraction.shutDown();
        sandbox.restore();
    });

    it("reuses one worker while resetting adaptive OCR state between images", async () => {
        const session = await textExtraction.createOcrSession({
            cacheMethod: "none",
            langPath: "/fixtures",
            gzip: false
        });
        await session.recognize("/tmp/first.jpg", {
            region: "name-core"
        });
        await session.recognize("/tmp/second.jpg", {
            region: "name-wide"
        });
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
        assert.isTrue(worker.setParameters.notCalled);
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
            textExtraction.scanImage(
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
        assert.isTrue(createWorkerStub.notCalled);
    });

    it("terminates a worker when OCR session initialization fails", async () => {
        const expectedError = new Error("language initialization failed");
        worker.loadLanguage.rejects(expectedError);

        let actualError;
        try {
            await textExtraction.createOcrSession({ cacheMethod: "none" });
        } catch (err) {
            actualError = err;
        }

        assert.strictEqual(actualError, expectedError);
        assert.isTrue(worker.terminate.calledOnce);
        assert.isTrue(worker.recognize.notCalled);
    });

    it("returns clean and raw OCR text from tesseract recognize", (done) => {
        const recognizeStub = worker.recognize.resolves({
            data: {
                text: "  Pacifism!! \n"
            }
        });

        textExtraction.scanImage("/tmp/fake-image.jpg", "name", (err, result) => {
            assert.isNull(err);
            assert.isTrue(recognizeStub.calledOnce);
            assert.equal(createWorkerStub.firstCall.args[0].cacheMethod, "none");
            assert.equal(result.cleanText, "PACIFISM");
            assert.equal(result.dirtyText, "  Pacifism!! \n");
            assert.containsAllKeys(result, ["confidence", "bestVariant", "candidates"]);
            done();
        });
    });

    it("returns OCR error when tesseract recognize rejects", (done) => {
        const expectedErr = new Error("OCR failed");
        const recognizeStub = worker.recognize.rejects(expectedErr);

        textExtraction.scanImage("/tmp/fake-image.jpg", "name", (err, result) => {
            assert.strictEqual(err, expectedErr);
            assert.isTrue(recognizeStub.calledOnce);
            assert.isNull(result);
            done();
        });
    });

    it("allows regression runs to disable the OCR cache and use a local language model", (done) => {
        worker.recognize.resolves({ data: { text: "Pacifism" } });

        textExtraction.scanImage(
            "/tmp/fake-image.jpg",
            "name",
            (err) => {
                assert.isNull(err);
                assert.include(createWorkerStub.firstCall.args[0], {
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
        const recognizeStub = worker.recognize.resolves({
            data: {
                text: "m\nThought Reﬂection éggg\n‘V' t, ”I“ . . 1 \\\\K‘ 'g‘r .\n",
                confidence: 53
            }
        });

        textExtraction.scanImage("/tmp/fake-image.jpg", "name", (err, result) => {
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
        const recognizeStub = worker.recognize
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
            textExtraction.scanImage(variants, "name", (err, extracted) => {
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

    it("processes OCR variants sequentially through the shared worker", async () => {
        let resolveFirst;
        const firstResult = new Promise((resolve) => {
            resolveFirst = resolve;
        });
        const recognizeStub = worker.recognize
            .onFirstCall()
            .returns(firstResult)
            .onSecondCall()
            .resolves({ data: { text: "Thought Reflection", confidence: 80 } });

        const variants = [
            { buffer: Buffer.from("a"), region: "name-core", psm: "line" },
            { buffer: Buffer.from("b"), region: "name-wide", psm: "line" }
        ];
        const extraction = new Promise((resolve, reject) => {
            textExtraction.scanImage(variants, "name", (err, result) => {
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
        worker.recognize.callsFake(async () => {
            const progressLogger = createWorkerStub.firstCall.args[0].logger;
            progressLogger({ status: "recognizing text", progress: 0.1 });
            progressLogger({ status: "recognizing text", progress: 0.5 });
            progressLogger({ status: "recognizing text", progress: 1 });
            return { data: { text: "Pacifism\n", confidence: 82 } };
        });

        await new Promise((resolve, reject) => {
            textExtraction.scanImage(
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

    it("reuses one worker for each candidate and terminates it on shutdown", async () => {
        worker.recognize
            .onFirstCall()
            .resolves({ data: { text: "Pacifism", confidence: 82 } })
            .onSecondCall()
            .resolves({ data: { text: "Pacifism", confidence: 80 } });

        const result = await new Promise((resolve, reject) => {
            textExtraction.scanImage(
                [
                    { buffer: Buffer.from("a"), region: "name-core", psm: "line" },
                    { buffer: Buffer.from("b"), region: "top-band", psm: "block" }
                ],
                "name",
                (err, extracted) => (err ? reject(err) : resolve(extracted)),
                { cacheMethod: "none", langPath: "/fixtures", gzip: false }
            );
        });

        assert.equal(result.cleanText, "PACIFISM");
        assert.isTrue(createWorkerStub.calledOnce);
        assert.include(createWorkerStub.firstCall.args[0], {
            cacheMethod: "none",
            langPath: "/fixtures",
            gzip: false
        });
        assert.deepEqual(worker.setParameters.args, [
            [{ tessedit_pageseg_mode: "7" }],
            [{ tessedit_pageseg_mode: "6" }]
        ]);
        assert.isTrue(worker.recognize.calledTwice);

        await textExtraction.shutDown();
        assert.isTrue(worker.terminate.calledOnce);
    });

    it("preserves each plausible OCR line as a bounded name candidate", async () => {
        worker.recognize.resolves({
            data: {
                text: "border noise\nScreaming Fury\n33\n",
                confidence: 61
            }
        });

        const result = await new Promise((resolve, reject) => {
            textExtraction.scanImage(
                [{ buffer: Buffer.from("card"), region: "top-band", psm: "block" }],
                "name",
                (err, extracted) => (err ? reject(err) : resolve(extracted))
            );
        });

        assert.include(result.textCandidates, "SCREAMING FURY");
        assert.isAtMost(result.textCandidates.length, 12);
    });

    it("keeps bounded token windows that remove short title-border noise", async () => {
        worker.recognize.resolves({
            data: {
                text: "Er of Mazarbul II\nNegate KL\n",
                confidence: 58
            }
        });

        const result = await new Promise((resolve, reject) => {
            textExtraction.scanImage(
                [{ buffer: Buffer.from("card"), region: "top-band", psm: "block" }],
                "name",
                (err, extracted) => (err ? reject(err) : resolve(extracted))
            );
        });

        assert.include(result.textCandidates, "OF MAZARBUL");
        assert.include(result.textCandidates, "NEGATE");
        assert.isAtMost(result.textCandidates.length, 12);
    });
});
