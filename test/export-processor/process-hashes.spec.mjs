import os from "os";
import { assert } from "chai";
import sinon from "sinon";
import _ from "lodash";
import exportProcessor from "../../src/export-processor/index.mjs";
import rds from "../../src/rds/index.mjs";
import imageHashing from "../../src/image-hashing/index.mjs";

process.env.CARD_NAMES_DB_PATH = os.tmpdir();

const { ProcessHashes } = exportProcessor;
const { CardHashes } = rds;
const { Hash } = imageHashing;

const FAKE_HASH = "THISISANEXAMPLEOFAFAKEHASHEEEEEE";
const CLOSE_DIFF_HASH = "THISISANEXAMPLEOFAFAKAHASHEEEEEE";
const FAR_DIFF_HASH = "THISISANEXAMPLEOFAHASHAADDEEDD";
const FAKE_SET = "FAKESET";

const FakeCards = [
    {
        image_uris: {
            normal: "http://www.fake.url/img"
        },
        set_name: FAKE_SET
    },
    {
        image_uris: {
            normal: "http://www.another.fake.url/img"
        },
        set_name: FAKE_SET
    }
];

describe("Integration::", () => {
    describe("ProcessHashes::", () => {
        let sandbox = sinon.createSandbox();
        let stubs = {};

        beforeEach(() => {
            stubs.getHashesStub = sandbox.stub(CardHashes, "GetHashes").callsArgWith(1, null, [
                {
                    cardHash: FAKE_HASH,
                    setName: FAKE_SET
                }
            ]);
            stubs.insertHashStub = sandbox
                .stub(ProcessHashes.prototype, "_insertCardHash")
                .returns();
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
                    error: "No Matches Found"
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
            stubs.hashImageStub = sandbox
                .stub(Hash, "HashImage")
                .onFirstCall()
                .callsArgWith(1, null, CLOSE_DIFF_HASH)
                .onSecondCall()
                .callsArgWith(1, null, FAKE_HASH);

            let hasher = ProcessHashes.create({
                cards: FakeCards,
                localHash: CLOSE_DIFF_HASH,
                name: "Test"
            });

            hasher.compareRemoteImages((err, matches) => {
                assert.isTrue(stubs.hashImageStub.calledTwice);
                assert.isTrue(stubs.insertHashStub.calledTwice);
                assert.isTrue(
                    _.filter(matches, {
                        setName: FAKE_SET
                    }).length === 2
                );
                return done(err);
            });
        });

        it("Should return no results for compareRemoteHashes", (done) => {
            stubs.hashImageStub = sandbox
                .stub(Hash, "HashImage")
                .onFirstCall()
                .callsArgWith(1, null, CLOSE_DIFF_HASH)
                .onSecondCall()
                .callsArgWith(1, null, FAKE_HASH);

            let hasher = ProcessHashes.create({
                cards: FakeCards,
                localHash: FAR_DIFF_HASH,
                name: "Test"
            });

            hasher.compareRemoteImages((err, matches) => {
                assert.isTrue(stubs.hashImageStub.calledTwice);
                assert.isTrue(stubs.insertHashStub.calledTwice);
                assert.isTrue(
                    _.filter(matches, {
                        setName: FAKE_SET
                    }).length === 0
                );
                return done(err);
            });
        });

        it("Should insert remote hash records with correct set + hash mapping when querying enabled", (done) => {
            stubs.insertHashStub.restore();
            stubs.hashImageStub = sandbox.stub(Hash, "HashImage").callsArgWith(1, null, FAKE_HASH);
            stubs.insertEntityStub = sandbox.stub(CardHashes, "InsertEntity").returns();

            let hasher = ProcessHashes.create({
                cards: [
                    {
                        image_uris: {
                            normal: "http://www.fake.url/img"
                        },
                        set_name: "SET_A"
                    }
                ],
                localHash: CLOSE_DIFF_HASH,
                name: "Test",
                queryingEnabled: true
            });

            hasher.compareRemoteImages((err) => {
                assert.isNull(err);
                assert.isTrue(stubs.insertEntityStub.calledOnce);
                assert.deepEqual(stubs.insertEntityStub.firstCall.args[0], {
                    Name: "Test",
                    SetName: "SET_A",
                    CardHash: FAKE_HASH
                });
                return done();
            });
        });
    });
});
