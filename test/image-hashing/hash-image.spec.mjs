import { assert } from "chai";
import sinon from "sinon";
import { compareHash, createHashing } from "../../src/image-hashing/hash-image.mjs";

describe("image-hashing::hash-image", () => {
    let sandbox;
    let fingerprintImageStub;
    let loadImageInputStub;
    let decodeImageStub;
    let hashImage;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        fingerprintImageStub = sandbox.stub();
        loadImageInputStub = sandbox.stub().resolves({
            buffer: Buffer.from("validated image"),
            dimensions: { width: 10, height: 10, format: "jpeg" }
        });
        decodeImageStub = sandbox.stub();
        ({ hashImage } = createHashing({
            fingerprintImage: fingerprintImageStub,
            loadImageInput: loadImageInputStub,
            decodeImage: decodeImageStub
        }));
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("hashImage::", () => {
        it("loads remote images through the bounded boundary with a User-Agent", (done) => {
            fingerprintImageStub.resolves({
                schemaVersion: 1,
                algorithm: "pdq-v1",
                encoding: "hex",
                hash: "0".repeat(64),
                bitLength: 256,
                quality: 100
            });

            hashImage("https://cards.scryfall.io/normal/front/a/b/card.jpg", (err, hash) => {
                assert.isNull(err);
                assert.equal(JSON.parse(hash).algorithm, "pdq-v1");
                assert.isTrue(loadImageInputStub.calledOnce);
                const [url, options] = loadImageInputStub.firstCall.args;
                assert.equal(url, "https://cards.scryfall.io/normal/front/a/b/card.jpg");
                assert.property(options.headers, "User-Agent");
                assert.isTrue(fingerprintImageStub.calledOnce);
                const [source, fingerprintOptions] = fingerprintImageStub.firstCall.args;
                assert.instanceOf(source, Buffer);
                assert.deepEqual(fingerprintOptions, { algorithm: "pdq-v1" });
                done(err);
            });
        });

        it("loads local images through the bounded boundary without request headers", (done) => {
            fingerprintImageStub.resolves({
                schemaVersion: 1,
                algorithm: "pdq-v1",
                encoding: "hex",
                hash: "0".repeat(64),
                bitLength: 256,
                quality: 100
            });

            hashImage("/tmp/some/local/card.png", (err) => {
                assert.isTrue(
                    loadImageInputStub.calledOnceWithExactly("/tmp/some/local/card.png", {})
                );
                assert.isTrue(fingerprintImageStub.calledOnce);
                const [source] = fingerprintImageStub.firstCall.args;
                assert.instanceOf(source, Buffer);
                done(err);
            });
        });

        it("normalizes a validated GIF or BMP before hashing", (done) => {
            loadImageInputStub.resolves({
                buffer: Buffer.from("validated gif"),
                dimensions: { width: 10, height: 10, format: "gif" }
            });
            decodeImageStub.resolves({
                getBuffer: sandbox.stub().resolves(Buffer.from("normalized png"))
            });
            fingerprintImageStub.resolves({
                schemaVersion: 1,
                algorithm: "pdq-v1",
                encoding: "hex",
                hash: "0".repeat(64),
                bitLength: 256,
                quality: 100
            });

            hashImage("/tmp/card.gif", (err, hash) => {
                assert.isNull(err);
                assert.equal(JSON.parse(hash).algorithm, "pdq-v1");
                assert.isTrue(decodeImageStub.calledOnce);
                const [source] = fingerprintImageStub.firstCall.args;
                assert.equal(source.toString(), "normalized png");
                done(err);
            });
        });

        it("forwards a hashing error to the callback", (done) => {
            fingerprintImageStub.rejects(new Error("boom"));

            hashImage("https://cards.scryfall.io/normal/front/a/b/card.jpg", (err, hash) => {
                assert.instanceOf(err, Error);
                assert.equal(err.message, "boom");
                assert.isUndefined(hash);
                done();
            });
        });

        it("does not invoke image-fingerprint when bounded input validation fails", (done) => {
            loadImageInputStub.rejects(
                new Error("Invalid or unsupported image: dimensions exceed limit")
            );

            hashImage("/tmp/hostile.jpg", (err) => {
                assert.match(err.message, /dimensions exceed limit/);
                assert.isFalse(fingerprintImageStub.called);
                done();
            });
        });
    });

    describe("compareHash::", () => {
        it("scores an identical hash as a perfect match", () => {
            const hash = "a".repeat(64);
            const result = compareHash(hash, hash);
            assert.isTrue(result.comparable);
            assert.equal(result.similarity, 1);
            assert.equal(result.distance, 0);
            assert.isTrue(result.matches);
        });

        it("does not compare legacy Blockhash cache entries with PDQ fingerprints", () => {
            const pdq = JSON.stringify({
                schemaVersion: 1,
                algorithm: "pdq-v1",
                encoding: "hex",
                hash: "0".repeat(64),
                bitLength: 256,
                quality: 100
            });
            const result = compareHash("a".repeat(64), pdq);
            assert.isFalse(result.comparable);
            assert.equal(result.reason, "algorithm-mismatch");
            assert.isFalse(result.matches);
        });

        it("keeps PDQ quality eligibility separate from mathematical similarity", () => {
            const lowQualityPdq = JSON.stringify({
                schemaVersion: 1,
                algorithm: "pdq-v1",
                encoding: "hex",
                hash: "0".repeat(64),
                bitLength: 256,
                quality: 10
            });
            const result = compareHash(lowQualityPdq, lowQualityPdq);
            assert.isTrue(result.comparable);
            assert.equal(result.similarity, 1);
            assert.equal(result.minQuality, 10);
            assert.isFalse(result.eligible);
            assert.isFalse(result.matches);
        });
    });
});
