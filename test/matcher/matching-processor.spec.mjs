import { assert } from "chai";
import sinon from "sinon";
import matcherModule from "../../src/matcher/matching-processor.mjs";

const { create, dependencies } = matcherModule;

describe("MatcherProcessor::", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("returns normalized set details when only one search result exists", (done) => {
        const expectedCard = {
            set_name: "M20",
            scryfall_uri: "https://scryfall.com/card/m20/1/example"
        };
        const searchStub = sandbox.stub(dependencies, "Searcher").resolves([expectedCard]);
        const hashStub = sandbox.stub(dependencies, "Hash");
        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg"
        });

        processor.execute((err, result) => {
            assert.isNull(err);
            assert.isTrue(searchStub.calledOnce);
            assert.isTrue(hashStub.notCalled);
            assert.deepEqual(result, ["M20"]);
            assert.deepEqual(processor.matchResultDetails, [
                {
                    setName: "M20",
                    scryfallUri: "https://scryfall.com/card/m20/1/example"
                }
            ]);
            done();
        });
    });

    it("errors when search results are not an array", (done) => {
        const searchStub = sandbox.stub(dependencies, "Searcher").resolves({});
        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg"
        });

        processor.execute((err) => {
            assert.isTrue(searchStub.calledOnce);
            assert.instanceOf(err, Error);
            assert.equal(err.message, "Error gathering results");
            done();
        });
    });

    it("merges DB + remote set matches for multi-result searches", (done) => {
        const processHashesInstance = {
            compareDbHashes: () => Promise.resolve([{ setName: "M20" }]),
            compareRemoteImages: () => Promise.resolve([{ setName: "M21" }, { setName: "M20" }])
        };

        const searchStub = sandbox.stub(dependencies, "Searcher").resolves([
            {
                set_name: "M20",
                image_uris: { normal: "https://example.com/m20.jpg" },
                scryfall_uri: "https://scryfall.com/card/m20/1/example"
            },
            {
                set_name: "M21",
                image_uris: { normal: "https://example.com/m21.jpg" },
                scryfall_uri: "https://scryfall.com/card/m21/1/example"
            }
        ]);
        const hashStub = sandbox.stub(dependencies, "Hash").resolves("FAKE_LOCAL_HASH");
        sandbox.stub(dependencies, "CreateDirectory").resolves("/tmp/set-symbol-dir");
        sandbox
            .stub(dependencies, "GetSetSymbolSnippetTmpFile")
            .resolves("/tmp/set-symbol-dir/set-symbol.png");
        sandbox.stub(dependencies, "CleanUpFiles").resolves();
        const processHashesStub = sandbox
            .stub(dependencies.HashProcessor, "create")
            .returns(processHashesInstance);

        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg"
        });

        processor.execute((err, result) => {
            assert.isNull(err);
            assert.isTrue(searchStub.calledOnce);
            assert.isTrue(hashStub.calledOnce);
            assert.isTrue(processHashesStub.calledOnce);
            assert.sameMembers(result, ["M20", "M21"]);
            assert.sameDeepMembers(processor.matchResultDetails, [
                { setName: "M20", scryfallUri: "https://scryfall.com/card/m20/1/example" },
                { setName: "M21", scryfallUri: "https://scryfall.com/card/m21/1/example" }
            ]);
            done();
        });
    });

    it("still uses local hash cache lookup when querying is disabled", (done) => {
        const processHashesInstance = {
            compareDbHashes: sandbox.stub().resolves([{ setName: "M20" }]),
            compareRemoteImages: () => Promise.resolve([{ setName: "M21" }])
        };

        sandbox.stub(dependencies, "Searcher").resolves([
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } },
            { set_name: "M21", image_uris: { normal: "https://example.com/m21.jpg" } }
        ]);
        sandbox.stub(dependencies, "Hash").resolves("FAKE_LOCAL_HASH");
        sandbox.stub(dependencies, "CreateDirectory").resolves("/tmp/set-symbol-dir");
        sandbox
            .stub(dependencies, "GetSetSymbolSnippetTmpFile")
            .resolves("/tmp/set-symbol-dir/set-symbol.png");
        sandbox.stub(dependencies, "CleanUpFiles").resolves();
        sandbox.stub(dependencies.HashProcessor, "create").returns(processHashesInstance);

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

        sandbox.stub(dependencies, "Searcher").resolves([
            { set_name: "M22", image_uris: { normal: "https://example.com/m22.jpg" } },
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } }
        ]);
        sandbox.stub(dependencies, "Hash").resolves("FAKE_LOCAL_HASH");
        sandbox.stub(dependencies, "CreateDirectory").resolves("/tmp/set-symbol-dir");
        sandbox
            .stub(dependencies, "GetSetSymbolSnippetTmpFile")
            .resolves("/tmp/set-symbol-dir/set-symbol.png");
        sandbox.stub(dependencies, "CleanUpFiles").resolves();
        sandbox.stub(dependencies.HashProcessor, "create").returns(processHashesInstance);

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

        sandbox.stub(dependencies, "Searcher").resolves([
            { set_name: "M21", image_uris: { normal: "https://example.com/m21.jpg" } },
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } }
        ]);
        const hashStub = sandbox.stub(dependencies, "Hash").resolves("FALLBACK_HASH");
        sandbox.stub(dependencies, "CreateDirectory").resolves("/tmp/set-symbol-dir");
        sandbox.stub(dependencies, "GetSetSymbolSnippetTmpFile").rejects(new Error("crop failed"));
        sandbox.stub(dependencies, "CleanUpFiles").resolves();
        sandbox.stub(dependencies.HashProcessor, "create").returns(processHashesInstance);

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
});
