import { assert } from "chai";
import sinon from "sinon";
import { hashImage, compareHash, dependencies } from "../../src/image-hashing/hash-image.mjs";

describe("image-hashing::hash-image", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("hashImage::", () => {
        // Scryfall's image CDN 400s a header-less request (Node's global fetch, which the
        // image-hash package uses, sends no User-Agent by default) -- every remote hash was
        // failing outright until this was fixed. Lock in that a remote URL always carries a
        // User-Agent through image-hash's {url, headers} request-object form.
        it("passes a User-Agent header for a remote http(s) URL", (done) => {
            const imageHashStub = sandbox
                .stub(dependencies, "imageHash")
                .callsArgWith(3, null, "hash");

            hashImage("https://cards.scryfall.io/normal/front/a/b/card.jpg", (err, hash) => {
                assert.isNull(err);
                assert.equal(hash, "hash");
                assert.isTrue(imageHashStub.calledOnce);
                const [source] = imageHashStub.firstCall.args;
                assert.equal(source.url, "https://cards.scryfall.io/normal/front/a/b/card.jpg");
                assert.property(source.headers, "User-Agent");
                assert.isNotEmpty(source.headers["User-Agent"]);
                done(err);
            });
        });

        it("passes a local file path through unchanged (no headers wrapper)", (done) => {
            const imageHashStub = sandbox
                .stub(dependencies, "imageHash")
                .callsArgWith(3, null, "hash");

            hashImage("/tmp/some/local/card.png", (err) => {
                assert.isTrue(imageHashStub.calledOnce);
                const [source] = imageHashStub.firstCall.args;
                assert.equal(source, "/tmp/some/local/card.png");
                done(err);
            });
        });

        it("forwards a hashing error to the callback", (done) => {
            sandbox.stub(dependencies, "imageHash").callsArgWith(3, new Error("boom"));

            hashImage("https://cards.scryfall.io/normal/front/a/b/card.jpg", (err, hash) => {
                assert.instanceOf(err, Error);
                assert.equal(err.message, "boom");
                assert.isUndefined(hash);
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
