import { assert } from "chai";
import {
    formatPrintLabel,
    normalizePrintCandidate,
    printIdentityKey
} from "../../src/matcher/print-candidate.mjs";

describe("print candidate contract", () => {
    it("preserves exact Scryfall printing and treatment metadata", () => {
        const candidate = normalizePrintCandidate({
            id: "print-123",
            oracle_id: "oracle-123",
            name: "Mothra, Supersonic Queen",
            flavor_name: "Mothra, Supersonic Queen",
            set: "iko",
            set_name: "Ikoria: Lair of Behemoths",
            collector_number: "66",
            lang: "en",
            illustration_id: "art-123",
            frame_effects: ["showcase"],
            full_art: true,
            promo_types: ["godzillaseries"],
            finishes: ["nonfoil", "foil"],
            image_uris: { normal: "https://cards.scryfall.io/card.jpg" },
            scryfall_uri: "https://scryfall.com/card/iko/66/example"
        });

        assert.include(candidate, {
            printId: "print-123",
            oracleId: "oracle-123",
            setCode: "IKO",
            setName: "Ikoria: Lair of Behemoths",
            collectorNumber: "66",
            illustrationId: "art-123",
            fullArt: true,
            imageUrl: "https://cards.scryfall.io/card.jpg"
        });
        assert.deepEqual(candidate.frameEffects, ["showcase"]);
        assert.deepEqual(candidate.promoTypes, ["godzillaseries"]);
        assert.equal(printIdentityKey(candidate), "id:print-123");
        assert.equal(formatPrintLabel(candidate), "IKO #66");
    });

    it("keeps same-set collector variants as distinct identities without IDs", () => {
        const regular = { setCode: "FIN", collectorNumber: "1", language: "en" };
        const borderless = { setCode: "FIN", collectorNumber: "301", language: "en" };

        assert.notEqual(printIdentityKey(regular), printIdentityKey(borderless));
    });

    it("uses front-face imagery when a double-faced card has no top-level image", () => {
        const candidate = normalizePrintCandidate({
            id: "dfc-1",
            card_faces: [
                {
                    printed_name: "Front Face",
                    image_uris: { normal: "https://cards.scryfall.io/front.jpg" }
                }
            ]
        });

        assert.equal(candidate.printedName, "Front Face");
        assert.equal(candidate.imageUrl, "https://cards.scryfall.io/front.jpg");
    });
});
