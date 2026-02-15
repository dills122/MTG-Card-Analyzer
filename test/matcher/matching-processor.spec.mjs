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

    it("returns the single card directly when only one search result exists", (done) => {
        const expectedCard = { set_name: "M20" };
        const searchStub = sandbox
            .stub(dependencies, "Searcher")
            .callsArgWith(1, null, [expectedCard]);
        const hashStub = sandbox.stub(dependencies, "Hash");
        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg"
        });

        processor.execute((err, result) => {
            assert.isNull(err);
            assert.isTrue(searchStub.calledOnce);
            assert.isTrue(hashStub.notCalled);
            assert.deepEqual(result, expectedCard);
            done();
        });
    });

    it("errors when search results are not an array", (done) => {
        const searchStub = sandbox.stub(dependencies, "Searcher").callsArgWith(1, null, {});
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
            compareDbHashes: (cb) => cb(null, [{ setName: "M20" }]),
            compareRemoteImages: (cb) => cb(null, [{ setName: "M21" }, { setName: "M20" }])
        };

        const searchStub = sandbox.stub(dependencies, "Searcher").callsArgWith(1, null, [
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
        const hashStub = sandbox.stub(dependencies, "Hash").callsArgWith(1, null, "FAKE_LOCAL_HASH");
        const processHashesStub = sandbox.stub(dependencies.HashProcessor, "create").returns(
            processHashesInstance
        );

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

    it("skips DB hash lookup when querying is disabled", (done) => {
        const processHashesInstance = {
            compareDbHashes: sandbox.stub().callsArgWith(0, null, [{ setName: "M20" }]),
            compareRemoteImages: (cb) => cb(null, [{ setName: "M21" }])
        };

        sandbox.stub(dependencies, "Searcher").callsArgWith(1, null, [
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } },
            { set_name: "M21", image_uris: { normal: "https://example.com/m21.jpg" } }
        ]);
        sandbox.stub(dependencies, "Hash").callsArgWith(1, null, "FAKE_LOCAL_HASH");
        sandbox.stub(dependencies.HashProcessor, "create").returns(processHashesInstance);

        const processor = create({
            name: "Pacifism",
            filePath: "/tmp/pacifism.jpg",
            queryingEnabled: false
        });

        processor.execute((err, result) => {
            assert.isNull(err);
            assert.isTrue(processHashesInstance.compareDbHashes.notCalled);
            assert.deepEqual(result, ["M21"]);
            done();
        });
    });

    it("falls back to remote matches when DB hash lookup errors", (done) => {
        const processHashesInstance = {
            compareDbHashes: sandbox.stub().callsArgWith(0, new Error("db down")),
            compareRemoteImages: (cb) => cb(null, [{ setName: "M22" }])
        };

        sandbox.stub(dependencies, "Searcher").callsArgWith(1, null, [
            { set_name: "M22", image_uris: { normal: "https://example.com/m22.jpg" } },
            { set_name: "M20", image_uris: { normal: "https://example.com/m20.jpg" } }
        ]);
        sandbox.stub(dependencies, "Hash").callsArgWith(1, null, "FAKE_LOCAL_HASH");
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
});
