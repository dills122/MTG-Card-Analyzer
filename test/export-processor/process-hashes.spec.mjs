import os from "os";
import path from "node:path";
import { assert } from "chai";
import sinon from "sinon";
import exportProcessor from "../../src/export-processor/index.mjs";
import storage from "../../src/storage/index.mjs";
import imageHashing from "../../src/image-hashing/index.mjs";

process.env.CARD_NAMES_DB_PATH = os.tmpdir();

const { ProcessHashes } = exportProcessor;
const CardHashes = storage.hashes;
const { Hash } = imageHashing;

function pdq(hash) {
    return JSON.stringify({
        schemaVersion: 1,
        algorithm: "pdq-v1",
        encoding: "hex",
        hash,
        bitLength: 256,
        quality: 100
    });
}

const FAKE_HASH = pdq("0".repeat(64));
const CLOSE_DIFF_HASH = pdq(`${"0".repeat(63)}1`);
const FAR_DIFF_HASH = pdq("f".repeat(64));
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
            const info = sandbox.stub();
            let hasher = ProcessHashes.create({
                cards: [{}, {}],
                localHash: CLOSE_DIFF_HASH,
                name: "Test",
                logger: { info, error: sandbox.stub() }
            });

            const matches = await hasher.compareDbHashes();
            let match = matches[0] || {};
            assert.isTrue(stubs.getHashesStub.calledOnce);
            assert.deepEqual(match.setName, FAKE_SET);
            assert.deepEqual(
                info.getCalls().map((call) => call.args[0]),
                ['Checking local hash cache for "Test"', 'Local hash cache matches for "Test": 1']
            );
        });

        it("Should ignore cached hashes from a different hashMode", async () => {
            stubs.getHashesStub.resolves([
                {
                    cardHash: CLOSE_DIFF_HASH,
                    setName: FAKE_SET,
                    hashMode: "full-card"
                }
            ]);
            const info = sandbox.stub();
            let hasher = ProcessHashes.create({
                cards: [{}, {}],
                localHash: CLOSE_DIFF_HASH,
                name: "Test",
                hashMode: "set-symbol",
                ignoreNoDbMatch: true,
                logger: { info, error: sandbox.stub() }
            });

            const matches = await hasher.compareDbHashes();
            assert.deepEqual(matches, []);
            assert.deepEqual(
                info.getCalls().map((call) => call.args[0]),
                [
                    'Checking local hash cache for "Test"',
                    'Skipped 1 cached hash(es) for "Test": hashMode mismatch (expected set-symbol)',
                    'Local hash cache matches for "Test": 0'
                ]
            );
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
            assert.instanceOf(caughtError, Error);
            assert.equal(caughtError.message, "No Matches Found");
        });

        it("Should fail to validate schema", () => {
            let hasher = () => ProcessHashes.create({});
            assert.throw(hasher, Error);
        });

        it("Should execute happy path for compareRemoteHashes", async () => {
            stubs.hashImageStub = sandbox
                .stub(Hash, "hashImage")
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

        it("awaits card-hash cache writes before remote comparison completes", async () => {
            let finishWrite;
            const pendingWrite = new Promise((resolve) => {
                finishWrite = resolve;
            });
            stubs.insertHashStub.returns(pendingWrite);
            sandbox.stub(Hash, "hashImage").callsArgWith(1, null, FAKE_HASH);
            const hasher = ProcessHashes.create({
                cards: [{ image_uris: { normal: "https://example.test/card.jpg" }, set_name: "A" }],
                localHash: CLOSE_DIFF_HASH,
                name: "Test"
            });
            let settled = false;

            const comparison = hasher.compareRemoteImages().finally(() => {
                settled = true;
            });
            while (!stubs.insertHashStub.called) {
                await new Promise((resolve) => setImmediate(resolve));
            }

            assert.isFalse(settled);
            finishWrite();
            const matches = await comparison;
            assert.isTrue(settled);
            assert.lengthOf(matches, 1);
            assert.isTrue(matches[0].verified);
            assert.equal(matches[0].matchKind, "remote-full-card-hash");
        });

        it("Should return no results for compareRemoteHashes", async () => {
            stubs.hashImageStub = sandbox
                .stub(Hash, "hashImage")
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
            stubs.hashImageStub = sandbox.stub(Hash, "hashImage").callsArgWith(1, null, FAKE_HASH);
            stubs.insertEntityStub = sandbox.stub(CardHashes, "upsert").returns();
            const info = sandbox.stub();

            let hasher = ProcessHashes.create({
                cards: [
                    {
                        id: "print-set-a-1",
                        oracle_id: "oracle-test",
                        set: "set",
                        collector_number: "1",
                        lang: "en",
                        illustration_id: "art-test",
                        scryfall_uri: "https://scryfall.com/card/set/1/test",
                        image_uris: {
                            normal: "http://www.fake.url/img"
                        },
                        set_name: "SET_A"
                    }
                ],
                localHash: CLOSE_DIFF_HASH,
                name: "Test",
                queryingEnabled: true,
                logger: { info, error: sandbox.stub() }
            });

            await hasher.compareRemoteImages();
            assert.isTrue(stubs.insertEntityStub.calledOnce);
            assert.deepEqual(stubs.insertEntityStub.firstCall.args[0], {
                cardName: "Test",
                printId: "print-set-a-1",
                oracleId: "oracle-test",
                setCode: "SET",
                setName: "SET_A",
                collectorNumber: "1",
                language: "en",
                illustrationId: "art-test",
                cardUrl: "http://www.fake.url/img",
                scryfallUri: "https://scryfall.com/card/set/1/test",
                cardHash: FAKE_HASH,
                hashMode: "full-card"
            });
            assert.equal(
                info.firstCall.args[0],
                'Comparing 1 Scryfall image for "Test" (full-card)'
            );
        });

        it("requests a full-card retry when remote set-symbol hashing fails", async () => {
            stubs.hashImageStub = sandbox.stub(Hash, "hashImage").callsArgWith(1, null, FAKE_HASH);
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
                .stub(hasher.dependencies, "createDirectory")
                .resolves("/tmp/remote-hash-dir");
            stubs.cleanupStub = sandbox.stub(hasher.dependencies, "cleanUpFiles").resolves();
            stubs.symbolStub = sandbox
                .stub(hasher, "_hashRemoteSetSymbol")
                .rejects(new Error("crop failed"));

            let caughtError;
            try {
                await hasher.compareRemoteImages();
            } catch (error) {
                caughtError = error;
            }
            assert.isTrue(stubs.symbolStub.calledOnce);
            assert.equal(caughtError.message, "crop failed");
            assert.isFalse(stubs.hashImageStub.called);
        });

        it("awaits remote set-symbol directory cleanup", async () => {
            sandbox.stub(Hash, "hashImage").callsArgWith(1, null, FAKE_HASH);
            const hasher = ProcessHashes.create({
                cards: [
                    {
                        image_uris: { normal: "https://example.test/card.jpg" },
                        set_name: "SET_A"
                    }
                ],
                localHash: CLOSE_DIFF_HASH,
                name: "Test",
                hashMode: "set-symbol"
            });
            sandbox.stub(hasher.dependencies, "createDirectory").resolves("/tmp/remote-hash-dir");
            sandbox.stub(hasher, "_hashRemoteSetSymbol").resolves(FAKE_HASH);
            let finishCleanup;
            const cleanup = sandbox.stub(hasher.dependencies, "cleanUpFiles").returns(
                new Promise((resolve) => {
                    finishCleanup = resolve;
                })
            );
            let settled = false;

            const comparison = hasher.compareRemoteImages().finally(() => {
                settled = true;
            });
            while (!cleanup.called) {
                await new Promise((resolve) => setImmediate(resolve));
            }

            assert.isFalse(settled);
            finishCleanup();
            const matches = await comparison;
            assert.isTrue(settled);
            assert.lengthOf(matches, 1);
            assert.isFalse(matches[0].verified);
            assert.equal(matches[0].matchKind, "remote-set-symbol-hash");
        });

        it("does not mask a remote hash error when cleanup also fails", async () => {
            const primaryError = new Error("remote hash failed");
            const error = sandbox.stub();
            const hasher = ProcessHashes.create({
                cards: [
                    {
                        image_uris: { normal: "https://example.test/card.jpg" },
                        set_name: "SET_A"
                    }
                ],
                localHash: CLOSE_DIFF_HASH,
                name: "Test",
                hashMode: "set-symbol",
                logger: { info: sandbox.stub(), error }
            });
            sandbox.stub(hasher.dependencies, "createDirectory").resolves("/tmp/remote-hash-dir");
            sandbox.stub(hasher, "_hashRemoteForComparison").rejects(primaryError);
            sandbox.stub(hasher.dependencies, "cleanUpFiles").rejects(new Error("cleanup failed"));

            let caughtError;
            try {
                await hasher.compareRemoteImages();
            } catch (err) {
                caughtError = err;
            }

            assert.equal(caughtError, primaryError);
            assert.isTrue(error.calledWithMatch(sinon.match(/cleanup failed/)));
        });

        it("passes a User-Agent header when reading a remote set-symbol image", async () => {
            let hasher = ProcessHashes.create({
                cards: [
                    {
                        image_uris: {
                            normal: "https://cards.scryfall.io/normal/front/a/b/card.jpg"
                        },
                        set_name: "SET_A"
                    }
                ],
                localHash: CLOSE_DIFF_HASH,
                name: "Test",
                hashMode: "set-symbol"
            });
            const readStub = sandbox.stub(hasher.dependencies, "readImage").resolves({});
            sandbox.stub(hasher.dependencies, "CropSetSymbol").returns({
                image: { write: sandbox.stub().resolves() },
                lowConfidence: false
            });
            sandbox.stub(Hash, "hashImage").callsArgWith(1, null, FAKE_HASH);

            await hasher._hashRemoteSetSymbol(
                "https://cards.scryfall.io/normal/front/a/b/card.jpg",
                "/tmp"
            );

            assert.isTrue(readStub.calledOnce);
            const [source, options] = readStub.firstCall.args;
            assert.equal(source, "https://cards.scryfall.io/normal/front/a/b/card.jpg");
            assert.property(options.headers, "User-Agent");
            assert.isNotEmpty(options.headers["User-Agent"]);
        });

        it("reads a local fixture path as a plain string, not a headers request object", async () => {
            const fixturePath = path.resolve(
                "test-images/regression/scryfall/fin-570-vivi-ornitier-25ef2d44.jpg"
            );
            let hasher = ProcessHashes.create({
                cards: [{ image_uris: { normal: fixturePath }, set_name: "SET_A" }],
                localHash: CLOSE_DIFF_HASH,
                name: "Test",
                hashMode: "set-symbol"
            });
            const readStub = sandbox.stub(hasher.dependencies, "readImage").resolves({});
            sandbox.stub(hasher.dependencies, "CropSetSymbol").returns({
                image: { write: sandbox.stub().resolves() },
                lowConfidence: false
            });
            sandbox.stub(Hash, "hashImage").callsArgWith(1, null, FAKE_HASH);

            await hasher._hashRemoteSetSymbol(fixturePath, "/tmp");

            assert.isTrue(readStub.calledOnceWithExactly(fixturePath, undefined));
        });

        it("requests a full-card retry when the remote set-symbol crop is low confidence", async () => {
            const fixturePath = path.resolve(
                "test-images/regression/scryfall/fin-570-vivi-ornitier-25ef2d44.jpg"
            );
            stubs.hashImageStub = sandbox.stub(Hash, "hashImage").callsArgWith(1, null, FAKE_HASH);
            let hasher = ProcessHashes.create({
                cards: [
                    {
                        image_uris: {
                            normal: fixturePath
                        },
                        set_name: "SET_A"
                    }
                ],
                localHash: CLOSE_DIFF_HASH,
                name: "Test",
                hashMode: "set-symbol"
            });

            stubs.createDirectoryStub = sandbox
                .stub(hasher.dependencies, "createDirectory")
                .resolves("/tmp/remote-hash-dir");
            stubs.cleanupStub = sandbox.stub(hasher.dependencies, "cleanUpFiles").resolves();
            stubs.cropStub = sandbox.stub(hasher.dependencies, "CropSetSymbol").returns({
                lowConfidence: true,
                reason: "flat region (stdDev 1 < 10)"
            });

            let caughtError;
            try {
                await hasher.compareRemoteImages();
            } catch (error) {
                caughtError = error;
            }
            assert.isTrue(stubs.cropStub.calledOnce);
            assert.match(caughtError.message, /Set symbol crop is low confidence/);
            assert.isFalse(stubs.hashImageStub.called);
        });
    });
});
