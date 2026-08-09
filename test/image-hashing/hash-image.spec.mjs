import { assert } from "chai";
import sinon from "sinon";
import { compareHash, createHashing } from "../../src/image-hashing/hash-image.mjs";

describe("image-hashing::hash-image", () => {
    let sandbox;
    let imageHashStub;
    let loadImageInputStub;
    let decodeImageStub;
    let hashImage;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        imageHashStub = sandbox.stub();
        loadImageInputStub = sandbox.stub().resolves({
            buffer: Buffer.from("validated image"),
            dimensions: { width: 10, height: 10, format: "jpeg" }
        });
        decodeImageStub = sandbox.stub();
        ({ hashImage } = createHashing({
            imageHash: imageHashStub,
            loadImageInput: loadImageInputStub,
            decodeImage: decodeImageStub
        }));
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("hashImage::", () => {
        it("loads remote images through the bounded boundary with a User-Agent", (done) => {
            imageHashStub.callsArgWith(3, null, "hash");

            hashImage("https://cards.scryfall.io/normal/front/a/b/card.jpg", (err, hash) => {
                assert.isNull(err);
                assert.equal(hash, "hash");
                assert.isTrue(loadImageInputStub.calledOnce);
                const [url, options] = loadImageInputStub.firstCall.args;
                assert.equal(url, "https://cards.scryfall.io/normal/front/a/b/card.jpg");
                assert.property(options.headers, "User-Agent");
                assert.isTrue(imageHashStub.calledOnce);
                const [source] = imageHashStub.firstCall.args;
                assert.instanceOf(source.data, Buffer);
                assert.equal(source.ext, "image/jpeg");
                done(err);
            });
        });

        it("loads local images through the bounded boundary without request headers", (done) => {
            imageHashStub.callsArgWith(3, null, "hash");

            hashImage("/tmp/some/local/card.png", (err) => {
                assert.isTrue(
                    loadImageInputStub.calledOnceWithExactly("/tmp/some/local/card.png", {})
                );
                assert.isTrue(imageHashStub.calledOnce);
                const [source] = imageHashStub.firstCall.args;
                assert.instanceOf(source.data, Buffer);
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
            imageHashStub.callsArgWith(3, null, "hash");

            hashImage("/tmp/card.gif", (err, hash) => {
                assert.isNull(err);
                assert.equal(hash, "hash");
                assert.isTrue(decodeImageStub.calledOnce);
                const [source] = imageHashStub.firstCall.args;
                assert.equal(source.ext, "image/png");
                assert.equal(source.data.toString(), "normalized png");
                done(err);
            });
        });

        it("forwards a hashing error to the callback", (done) => {
            imageHashStub.callsArgWith(3, new Error("boom"));

            hashImage("https://cards.scryfall.io/normal/front/a/b/card.jpg", (err, hash) => {
                assert.instanceOf(err, Error);
                assert.equal(err.message, "boom");
                assert.isUndefined(hash);
                done();
            });
        });

        it("does not invoke image-hash when bounded input validation fails", (done) => {
            loadImageInputStub.rejects(
                new Error("Invalid or unsupported image: dimensions exceed limit")
            );

            hashImage("/tmp/hostile.jpg", (err) => {
                assert.match(err.message, /dimensions exceed limit/);
                assert.isFalse(imageHashStub.called);
                done();
            });
        });
    });

    describe("compareHash::", () => {
        it("scores an identical hash as a perfect match", () => {
            const hash = "a".repeat(64);
            const result = compareHash(hash, hash);
            assert.equal(result.twoBitMatches, 1);
            assert.equal(result.fourBitMatches, 1);
            assert.equal(result.stringCompare, 1);
        });
    });
});
