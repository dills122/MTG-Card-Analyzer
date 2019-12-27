const {
    assert,
    expect
} = require("chai");
const sinon = require("sinon");
const ProcessHashes = require("../../src/export-processor/").ProcessHashes;
const CardHashes = require("../../src/rds").CardHashes;
const Hash = require("../../src/image-hashing").Hash;
const _ = require("lodash");

const FAKE_HASH = "THISISANEXAMPLEOFAFAKEHASHEEEEEE";
const CLOSE_DIFF_HASH = "THISISANEXAMPLEOFAFAKAHASHEEEEEE";
const FAR_DIFF_HASH = "THISISANEXAMPLEOFAHASHAADDEEDD";
const FAKE_SET = "FAKESET";

const FakeCards = [{
    image_uris: {
        normal: 'http://www.fake.url/img'
    },
    set_name: FAKE_SET
}, {
    image_uris: {
        normal: 'http://www.another.fake.url/img'
    },
    set_name: FAKE_SET
}];

describe("Integration::", () => {
    describe("ProcessHashes::", () => {
        let sandbox = sinon.createSandbox();
        let stubs = {};

        beforeEach(() => {
            stubs.getHashesStub = sandbox.stub(CardHashes, "GetHashes").callsArgWith(1, null, [{
                cardHash: FAKE_HASH,
                setName: FAKE_SET
            }]);
            stubs.insertHashStub = sandbox.stub(ProcessHashes.prototype, "_insertCardHash").returns();
        });
        afterEach(() => {
            sandbox.restore();
        });

        it("Should execute happy path for compareDbHashes", (done) => {
            let hasher = ProcessHashes.create({
                cards: [{}, {}],
                localHash: CLOSE_DIFF_HASH,
                name: "Test"
            });

            hasher.compareDbHashes((err, matches) => {
                let match = matches[0] || {};
                assert.isTrue(stubs.getHashesStub.calledOnce);
                assert.deepEqual(match.setName, FAKE_SET);
                return done(err);
            });
        });

        it("Should fail with no match found error", (done) => {
            let hasher = ProcessHashes.create({
                cards: [{}, {}],
                localHash: FAR_DIFF_HASH,
                name: "Test"
            });

            hasher.compareDbHashes((err, matches) => {
                assert.isTrue(stubs.getHashesStub.calledOnce);
                assert.deepEqual(err, {
                    error: 'No Matches Found'
                });
                assert.isUndefined(matches);
                return done();
            });
        });

        it("Should fail to validate schema", (done) => {
            let hasher = () => ProcessHashes.create({});
            assert.throw(hasher, Error);
            return done();
        });

        it("Should execute happy path for compareRemoteHashes", (done) => {
            stubs.hashImageStub = sandbox.stub(Hash, "HashImage")
                .onFirstCall().callsArgWith(1, null, CLOSE_DIFF_HASH)
                .onSecondCall().callsArgWith(1, null, FAKE_HASH);

            let hasher = ProcessHashes.create({
                cards: FakeCards,
                localHash: CLOSE_DIFF_HASH,
                name: 'Test'
            });

            hasher.compareRemoteImages((err, matches) => {
                assert.isTrue(stubs.hashImageStub.calledTwice);
                assert.isTrue(stubs.insertHashStub.calledTwice);
                assert.isTrue(_.filter(matches, {
                    setName: FAKE_SET
                }).length === 2);
                return done(err);
            });
        });

        it("Should return no results for compareRemoteHashes", (done) => {
            stubs.hashImageStub = sandbox.stub(Hash, "HashImage")
                .onFirstCall().callsArgWith(1, null, CLOSE_DIFF_HASH)
                .onSecondCall().callsArgWith(1, null, FAKE_HASH);

            let hasher = ProcessHashes.create({
                cards: FakeCards,
                localHash: FAR_DIFF_HASH,
                name: 'Test'
            });

            hasher.compareRemoteImages((err, matches) => {
                assert.isTrue(stubs.hashImageStub.calledTwice);
                assert.isTrue(stubs.insertHashStub.calledTwice);
                assert.isTrue(_.filter(matches, {
                    setName: FAKE_SET
                }).length === 0);
                return done(err);
            });
        });
    });
})