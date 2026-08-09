import { assert } from "chai";
import sinon from "sinon";
import { backFillCardHashes, backFillMatchingCards } from "../src/back-filler.mjs";
import storage from "../src/storage/index.mjs";
import scryfall from "../src/scryfall-api/index.mjs";
import imageHashing from "../src/image-hashing/index.mjs";

describe("back-filler", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("hashes each printing and stores its card metadata", async () => {
        sandbox.stub(scryfall.Search, "searchList").resolves([
            {
                name: "Pacifism",
                set_name: "Core Set 2020",
                foil: true,
                promo: false,
                image_uris: { normal: "https://example.test/pacifism.jpg" }
            }
        ]);
        sandbox.stub(imageHashing.Hash, "hashImage").callsArgWith(1, null, "fake-hash");
        const upsert = sandbox.stub(storage.hashes, "upsert");

        const success = await backFillCardHashes("Pacifism");

        assert.isTrue(success);
        assert.isTrue(
            upsert.calledOnceWithExactly({
                cardName: "Pacifism",
                setName: "Core Set 2020",
                isFoil: true,
                isPromo: false,
                cardHash: "fake-hash",
                hashMode: "full-card"
            })
        );
    });

    it("reports a concise error when Scryfall lookup fails", async () => {
        sandbox.stub(scryfall.Search, "searchList").rejects(new Error("network unavailable"));
        const consoleError = sandbox.stub(console, "error");

        const success = await backFillCardHashes("Pacifism");

        assert.isFalse(success);
        assert.isTrue(
            consoleError.calledOnceWithExactly(
                'ERROR Unable to backfill hashes for "Pacifism": network unavailable'
            )
        );
    });

    it("reports failure only after a cache write rejects", async () => {
        sandbox.stub(scryfall.Search, "searchList").resolves([
            {
                name: "Pacifism",
                set_name: "Core Set 2020",
                image_uris: { normal: "https://example.test/pacifism.jpg" }
            }
        ]);
        sandbox.stub(imageHashing.Hash, "hashImage").callsArgWith(1, null, "fake-hash");
        sandbox.stub(storage.hashes, "upsert").rejects(new Error("disk full"));
        const consoleError = sandbox.stub(console, "error");

        const success = await backFillCardHashes("Pacifism");

        assert.isFalse(success);
        assert.isTrue(consoleError.calledWithMatch(sinon.match(/disk full/)));
    });

    it("backfills every stored card name", async () => {
        sandbox
            .stub(storage.names, "getAll")
            .resolves([{ name: "Pacifism" }, { name: "Fireball" }]);
        const search = sandbox.stub(scryfall.Search, "searchList").resolves([]);
        sandbox.stub(storage.hashes, "upsert");

        await backFillMatchingCards();

        assert.deepEqual(
            search.getCalls().map((call) => call.args),
            [["Pacifism"], ["Fireball"]]
        );
    });
});
