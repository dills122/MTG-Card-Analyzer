import os from "os";
import { assert } from "chai";
import sinon from "sinon";
import exportProcessor from "../../src/export-processor/index.mjs";
import storage from "../../src/storage/index.mjs";
import imageHashing from "../../src/image-hashing/index.mjs";

process.env.CARD_NAMES_DB_PATH = os.tmpdir();

const { ProcessHashes } = exportProcessor;
const CardHashes = storage.hashes;
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
            stubs.getHashesStub = sandbox.stub(CardHashes, "getByCardName").resolves([
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

        it("Should execute happy path for compareDbHashes", async () => {
            let hasher = ProcessHashes.create({
                cards: [{}, {}],
                localHash: CLOSE_DIFF_HASH,
                name: "Test"
            });

            const matches = await hasher.compareDbHashes();
            let match = matches[0] || {};
            assert.isTrue(stubs.getHashesStub.calledOnce);
            assert.deepEqual(match.setName, FAKE_SET);
        });

        it("Should fail with no match found error", async () => {
            let hasher = ProcessHashes.create({
                cards: [{}, {}],
                localHash: FAR_DIFF_HASH,
                name: "Test"
            });

            let caughtError;
            try {
                await hasher.compareDbHashes();
            } catch (err) {
                caughtError = err;
            }
            assert.isTrue(stubs.getHashesStub.calledOnce);
            assert.deepEqual(caughtError, {
                error: "No Matches Found"
            });
        });

        it("Should fail to validate schema", () => {
            let hasher = () => ProcessHashes.create({});
            assert.throw(hasher, Error);
        });

        it("Should execute happy path for compareRemoteHashes", async () => {
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

            const matches = await hasher.compareRemoteImages();
            assert.isTrue(stubs.hashImageStub.calledTwice);
            assert.isTrue(stubs.insertHashStub.calledTwice);
            assert.isTrue(matches.filter((match) => match.setName === FAKE_SET).length === 2);
        });

        it("Should return no results for compareRemoteHashes", async () => {
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

            const matches = await hasher.compareRemoteImages();
            assert.isTrue(stubs.hashImageStub.calledTwice);
            assert.isTrue(stubs.insertHashStub.calledTwice);
            assert.isTrue(matches.filter((match) => match.setName === FAKE_SET).length === 0);
        });

        it("Should insert remote hash records with correct set + hash mapping when querying enabled", async () => {
            stubs.insertHashStub.restore();
            stubs.hashImageStub = sandbox.stub(Hash, "HashImage").callsArgWith(1, null, FAKE_HASH);
            stubs.insertEntityStub = sandbox.stub(CardHashes, "upsert").returns();

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

            await hasher.compareRemoteImages();
            assert.isTrue(stubs.insertEntityStub.calledOnce);
            assert.deepEqual(stubs.insertEntityStub.firstCall.args[0], {
                cardName: "Test",
                setName: "SET_A",
                cardHash: FAKE_HASH
            });
        });

        it("Should fall back to full remote hash when remote set-symbol hashing fails", async () => {
            stubs.hashImageStub = sandbox.stub(Hash, "HashImage").callsArgWith(1, null, FAKE_HASH);
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
                hashMode: "set-symbol"
            });

            stubs.createDirectoryStub = sandbox
                .stub(hasher.dependencies, "CreateDirectory")
                .resolves("/tmp/remote-hash-dir");
            stubs.cleanupStub = sandbox.stub(hasher.dependencies, "CleanUpFiles").resolves();
            stubs.symbolStub = sandbox
                .stub(hasher, "_hashRemoteSetSymbol")
                .rejects(new Error("crop failed"));

            await hasher.compareRemoteImages();
            assert.isTrue(stubs.symbolStub.calledOnce);
            assert.isTrue(stubs.hashImageStub.calledOnce);
            assert.equal(stubs.hashImageStub.firstCall.args[0], "http://www.fake.url/img");
        });
    });
});
