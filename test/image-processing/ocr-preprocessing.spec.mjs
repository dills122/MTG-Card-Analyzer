import { assert } from "chai";
import path from "node:path";
import { prepareOcrVariants } from "../../src/image-processing/ocr-preprocessing.mjs";

describe("OCR preprocessing::", () => {
    it("builds a single soft rules-text fallback region", async () => {
        const fixturePath = path.resolve(
            "test-images/regression/scryfall/fin-570-vivi-ornitier-25ef2d44.jpg"
        );

        const { variants, previewPath } = await prepareOcrVariants(fixturePath, "rules-name");

        assert.lengthOf(variants, 1);
        assert.equal(variants[0].region, "rules-name");
        assert.equal(variants[0].psm, "block");
        assert.isAbove(variants[0].image.bitmap.width, 900);
        assert.isUndefined(previewPath);
    });
});
