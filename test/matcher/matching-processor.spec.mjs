import { assert } from "chai";
import sinon from "sinon";
import matcherModule from "../../src/matcher/matching-processor.mjs";

const { create: createMatcher } = matcherModule;

describe("MatcherProcessor::", () => {
    let sandbox;
    let dependencies;

    function create(params) {
        return createMatcher({ ...params, dependencies });
    }

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        dependencies = {
            searchPrintings() {},
            processHashes: { create() {} },
            hashImage() {},
            createDirectory() {},
            cleanUpFiles() {},
            writeSetSymbolSnippet() {}
        };
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("returns one unverified exact-print candidate when only one search result exists", async () => {
        const info = sandbox.stub();
        const expectedCard = {
            id: "print-m20-1",
            set: "m20",
            set_name: "M20",
            collector_number: "1",
            scryfall_uri: "https://scryfall.com/card/m20/1/example"
        };
        const searchStub = sandbox.stub(dependencies, "searchPrintings").resolves([expectedCard]);
        const hashStub = sandbox.stub(dependencies, "hashImage");
        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg",
            logger: { info, error: sandbox.stub() }
        });

        const result = await processor.executeAsync();

        assert.isTrue(searchStub.calledOnce);
        assert.isTrue(hashStub.notCalled);
        assert.deepEqual(result, ["M20"]);
        assert.lengthOf(processor.matchResultDetails, 1);
        assert.include(processor.matchResultDetails[0], {
            printId: "print-m20-1",
            setCode: "M20",
            setName: "M20",
            collectorNumber: "1",
            scryfallUri: "https://scryfall.com/card/m20/1/example",
            matchKind: "catalog-candidate-only",
            verified: false
        });
        assert.deepEqual(
            info.getCalls().map((call) => call.args[0]),
            ['Searching Scryfall for "Pacifism"', 'Scryfall returned 1 printing for "Pacifism"']
        );
    });

    it("errors when search results are not an array", (done) => {
        const searchStub = sandbox.stub(dependencies, "searchPrintings").resolves({});
        const logger = { info: sandbox.stub(), error: sandbox.stub() };
        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg",
            logger
        });

        processor.execute((err) => {
            assert.isTrue(searchStub.calledOnce);
            assert.instanceOf(err, Error);
            assert.equal(err.message, "Error gathering results");
            assert.isTrue(
                logger.error.calledOnceWithExactly(
                    'Scryfall response for "Pacifism" was not a printing list'
                )
            );
            done();
        });
    });

    it("merges DB + remote exact-print matches for multi-result searches", async () => {
        const processHashesInstance = {
            compareDbHashes: () =>
                Promise.resolve([
                    { printId: "m20-1", setCode: "M20", setName: "M20", verified: true }
                ]),
            compareRemoteImages: () =>
                Promise.resolve([
                    {
                        printId: "m21-1",
                        setCode: "M21",
                        setName: "M21",
                        verified: true,
                        comparable: true,
                        algorithm: "pdq-v1",
                        similarity: 0.96,
                        distance: 10,
                        bitLength: 256,
                        leftQuality: 100,
                        rightQuality: 98,
                        minQuality: 98,
                        eligible: true,
                        matches: true
                    },
                    { printId: "m20-1", setCode: "M20", setName: "M20", verified: true }
                ])
        };

        const searchStub = sandbox.stub(dependencies, "searchPrintings").resolves([
            {
                id: "m20-1",
                set: "m20",
                collector_number: "1",
                set_name: "M20",
                image_uris: { normal: "https://example.com/m20.jpg" },
                scryfall_uri: "https://scryfall.com/card/m20/1/example"
            },
            {
                id: "m21-1",
                set: "m21",
                collector_number: "1",
                set_name: "M21",
                image_uris: { normal: "https://example.com/m21.jpg" },
                scryfall_uri: "https://scryfall.com/card/m21/1/example"
            }
        ]);
        const hashStub = sandbox.stub(dependencies, "hashImage").resolves("FAKE_LOCAL_HASH");
        sandbox.stub(dependencies, "createDirectory").resolves("/tmp/set-symbol-dir");
        sandbox
            .stub(dependencies, "writeSetSymbolSnippet")
            .resolves("/tmp/set-symbol-dir/set-symbol.png");
        sandbox.stub(dependencies, "cleanUpFiles").resolves();
        const processHashesStub = sandbox
            .stub(dependencies.processHashes, "create")
            .returns(processHashesInstance);

        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg"
        });

        const result = await processor.executeAsync();

        assert.isTrue(searchStub.calledOnce);
        assert.isTrue(hashStub.calledOnce);
        assert.isTrue(processHashesStub.calledOnce);
        assert.sameMembers(result, ["M20", "M21"]);
        assert.sameMembers(
            processor.matchResultDetails.map((printing) => printing.printId),
            ["m20-1", "m21-1"]
        );
        assert.isTrue(processor.matchResultDetails.every((printing) => printing.verified));
        assert.deepInclude(
            processor.matchResultDetails.find((printing) => printing.printId === "m21-1")
                .comparison,
            {
                comparable: true,
                algorithm: "pdq-v1",
                similarity: 0.96,
                distance: 10,
                bitLength: 256,
                minQuality: 98,
                eligible: true,
                matches: true
            }
        );
    });

    it("preserves two verified variants from the same set", async () => {
        const processHashesInstance = {
            compareDbHashes: sandbox.stub().resolves([]),
            compareRemoteImages: sandbox.stub().resolves([
                {
                    printId: "fin-1",
                    setCode: "FIN",
                    setName: "Final Fantasy",
                    collectorNumber: "1",
                    verified: true
                },
                {
                    printId: "fin-301",
                    setCode: "FIN",
                    setName: "Final Fantasy",
                    collectorNumber: "301",
                    verified: true
                }
            ])
        };
        sandbox.stub(dependencies, "searchPrintings").resolves([
            { id: "fin-1", set: "fin", set_name: "Final Fantasy", collector_number: "1" },
            {
                id: "fin-301",
                set: "fin",
                set_name: "Final Fantasy",
                collector_number: "301"
            }
        ]);
        sandbox.stub(dependencies, "hashImage").resolves("FAKE_LOCAL_HASH");
        sandbox.stub(dependencies, "createDirectory").rejects(new Error("no temp dir"));
        sandbox.stub(dependencies.processHashes, "create").returns(processHashesInstance);
        const processor = create({ name: "Example", filePath: "/tmp/example.jpg" });

        const result = await processor.executeAsync();

        assert.deepEqual(result, ["Final Fantasy"]);
        assert.sameMembers(
            processor.matchResultDetails.map((printing) => printing.printId),
            ["fin-1", "fin-301"]
        );
    });

    it("still uses local hash cache lookup when querying is disabled", (done) => {
        const processHashesInstance = {
            compareDbHashes: sandbox.stub().resolves([{ setName: "M20" }]),
            compareRemoteImages: () => Promise.resolve([{ setName: "M21" }])
        };

        sandbox.stub(dependencies, "searchPrintings").resolves([
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } },
            { set_name: "M21", image_uris: { normal: "https://example.com/m21.jpg" } }
        ]);
        sandbox.stub(dependencies, "hashImage").resolves("FAKE_LOCAL_HASH");
        sandbox.stub(dependencies, "createDirectory").resolves("/tmp/set-symbol-dir");
        sandbox
            .stub(dependencies, "writeSetSymbolSnippet")
            .resolves("/tmp/set-symbol-dir/set-symbol.png");
        sandbox.stub(dependencies, "cleanUpFiles").resolves();
        sandbox.stub(dependencies.processHashes, "create").returns(processHashesInstance);

        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg",
            queryingEnabled: false
        });

        processor.execute((err, result) => {
            assert.isNull(err);
            assert.isTrue(processHashesInstance.compareDbHashes.calledOnce);
            assert.sameMembers(result, ["M20", "M21"]);
            done();
        });
    });

    it("falls back to remote matches when DB hash lookup errors", (done) => {
        const processHashesInstance = {
            compareDbHashes: sandbox.stub().rejects(new Error("db down")),
            compareRemoteImages: () => Promise.resolve([{ setName: "M22" }])
        };

        sandbox.stub(dependencies, "searchPrintings").resolves([
            { set_name: "M22", image_uris: { normal: "https://example.com/m22.jpg" } },
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } }
        ]);
        sandbox.stub(dependencies, "hashImage").resolves("FAKE_LOCAL_HASH");
        sandbox.stub(dependencies, "createDirectory").resolves("/tmp/set-symbol-dir");
        sandbox
            .stub(dependencies, "writeSetSymbolSnippet")
            .resolves("/tmp/set-symbol-dir/set-symbol.png");
        sandbox.stub(dependencies, "cleanUpFiles").resolves();
        sandbox.stub(dependencies.processHashes, "create").returns(processHashesInstance);

        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg",
            queryingEnabled: true
        });

        processor.execute((err, result) => {
            assert.isNull(err);
            assert.isTrue(processHashesInstance.compareDbHashes.calledOnce);
            assert.deepEqual(result, ["M22"]);
            done();
        });
    });

    it("falls back to hashing full card when set symbol crop fails", (done) => {
        const processHashesInstance = {
            compareDbHashes: () => Promise.resolve([]),
            compareRemoteImages: () => Promise.resolve([{ setName: "M21" }])
        };

        sandbox.stub(dependencies, "searchPrintings").resolves([
            { set_name: "M21", image_uris: { normal: "https://example.com/m21.jpg" } },
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } }
        ]);
        const hashStub = sandbox.stub(dependencies, "hashImage").resolves("FALLBACK_HASH");
        sandbox.stub(dependencies, "createDirectory").resolves("/tmp/set-symbol-dir");
        sandbox.stub(dependencies, "writeSetSymbolSnippet").rejects(new Error("crop failed"));
        sandbox.stub(dependencies, "cleanUpFiles").resolves();
        sandbox.stub(dependencies.processHashes, "create").returns(processHashesInstance);

        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg"
        });

        processor.execute((err, result) => {
            assert.isNull(err);
            assert.equal(hashStub.firstCall.args[0], "/tmp/pacifism.jpg");
            assert.deepEqual(result, ["M21"]);
            done();
        });
    });

    it("retries with full-card fingerprints when set-symbol matching is inconclusive", async () => {
        const setSymbolHasher = {
            compareDbHashes: sandbox.stub().resolves([]),
            compareRemoteImages: sandbox.stub().resolves([])
        };
        const fullCardHasher = {
            compareDbHashes: sandbox.stub().resolves([]),
            compareRemoteImages: sandbox.stub().resolves([{ setName: "M21" }])
        };
        sandbox.stub(dependencies, "searchPrintings").resolves([
            { set_name: "M21", image_uris: { normal: "https://example.com/m21.jpg" } },
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } }
        ]);
        const hashStub = sandbox
            .stub(dependencies, "hashImage")
            .onFirstCall()
            .resolves("SET_SYMBOL_HASH")
            .onSecondCall()
            .resolves("FULL_CARD_HASH");
        sandbox.stub(dependencies, "createDirectory").resolves("/tmp/set-symbol-dir");
        sandbox
            .stub(dependencies, "writeSetSymbolSnippet")
            .resolves("/tmp/set-symbol-dir/set-symbol.png");
        sandbox.stub(dependencies, "cleanUpFiles").resolves();
        const processHashesStub = sandbox
            .stub(dependencies.processHashes, "create")
            .onFirstCall()
            .returns(setSymbolHasher)
            .onSecondCall()
            .returns(fullCardHasher);

        const result = await create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg",
            logger: { info: sandbox.stub(), error: sandbox.stub() }
        }).executeAsync();

        assert.deepEqual(result, ["M21"]);
        assert.isTrue(hashStub.calledTwice);
        assert.equal(hashStub.secondCall.args[0], "/tmp/pacifism.jpg");
        assert.equal(processHashesStub.firstCall.args[0].hashMode, "set-symbol");
        assert.equal(processHashesStub.secondCall.args[0].hashMode, "full-card");
        assert.equal(processHashesStub.secondCall.args[0].localHash, "FULL_CARD_HASH");
    });

    it("retries with full-card fingerprints when remote set-symbol comparison fails", async () => {
        const setSymbolError = new Error("remote symbol crop failed");
        const setSymbolHasher = {
            compareDbHashes: sandbox.stub().resolves([]),
            compareRemoteImages: sandbox.stub().rejects(setSymbolError)
        };
        const fullCardHasher = {
            compareDbHashes: sandbox.stub().resolves([]),
            compareRemoteImages: sandbox.stub().resolves([{ setName: "M21" }])
        };
        sandbox.stub(dependencies, "searchPrintings").resolves([
            { set_name: "M21", image_uris: { normal: "https://example.com/m21.jpg" } },
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } }
        ]);
        sandbox.stub(dependencies, "hashImage").resolves("HASH");
        sandbox.stub(dependencies, "createDirectory").resolves("/tmp/set-symbol-dir");
        sandbox
            .stub(dependencies, "writeSetSymbolSnippet")
            .resolves("/tmp/set-symbol-dir/set-symbol.png");
        sandbox.stub(dependencies, "cleanUpFiles").resolves();
        sandbox
            .stub(dependencies.processHashes, "create")
            .onFirstCall()
            .returns(setSymbolHasher)
            .onSecondCall()
            .returns(fullCardHasher);
        const error = sandbox.stub();

        const result = await create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg",
            logger: { info: sandbox.stub(), error }
        }).executeAsync();

        assert.deepEqual(result, ["M21"]);
        assert.isTrue(error.calledWithMatch(sinon.match(/retrying full card/)));
        assert.isTrue(fullCardHasher.compareRemoteImages.calledOnce);
    });

    it("awaits local set-symbol cleanup before comparing hashes", async () => {
        const processHashesInstance = {
            compareDbHashes: sandbox.stub().resolves([]),
            compareRemoteImages: sandbox.stub().resolves([{ setName: "M21" }])
        };
        sandbox.stub(dependencies, "searchPrintings").resolves([
            { set_name: "M21", image_uris: { normal: "https://example.com/m21.jpg" } },
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } }
        ]);
        sandbox.stub(dependencies, "hashImage").resolves("FAKE_LOCAL_HASH");
        sandbox.stub(dependencies, "createDirectory").resolves("/tmp/set-symbol-dir");
        sandbox
            .stub(dependencies, "writeSetSymbolSnippet")
            .resolves("/tmp/set-symbol-dir/set-symbol.png");
        let finishCleanup;
        const cleanup = sandbox.stub(dependencies, "cleanUpFiles").returns(
            new Promise((resolve) => {
                finishCleanup = resolve;
            })
        );
        const processHashesStub = sandbox
            .stub(dependencies.processHashes, "create")
            .returns(processHashesInstance);
        const processor = create({ name: "Pacifism", filePath: "/tmp/pacifism.jpg" });

        const execution = processor.executeAsync();
        while (!cleanup.called) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        assert.isFalse(processHashesStub.called);
        finishCleanup();
        const result = await execution;
        assert.deepEqual(result, ["M21"]);
        assert.isTrue(processHashesStub.calledOnce);
    });

    it("does not mask a full-card hash error when set-symbol cleanup also fails", async () => {
        const primaryError = new Error("full hash failed");
        const error = sandbox.stub();
        sandbox.stub(dependencies, "searchPrintings").resolves([
            { set_name: "M21", image_uris: { normal: "https://example.com/m21.jpg" } },
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } }
        ]);
        sandbox.stub(dependencies, "createDirectory").resolves("/tmp/set-symbol-dir");
        sandbox.stub(dependencies, "writeSetSymbolSnippet").rejects(new Error("crop failed"));
        sandbox.stub(dependencies, "cleanUpFiles").rejects(new Error("cleanup failed"));
        sandbox.stub(dependencies, "hashImage").rejects(primaryError);
        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg",
            logger: { info: sandbox.stub(), error }
        });

        let caughtError;
        try {
            await processor.executeAsync();
        } catch (err) {
            caughtError = err;
        }

        assert.equal(caughtError, primaryError);
        assert.isTrue(error.calledWithMatch(sinon.match(/cleanup failed/)));
    });
});
