import { expect } from "chai";
import { Jimp } from "jimp";
import { adjustBrightness } from "../../src/image-processing/color-adjustments.mjs";

function pixelChannels(image) {
    return Array.from(image.bitmap.data.subarray(0, 4));
}

describe("color adjustments", () => {
    it("preserves the additive brightness contract used by OCR tuning", () => {
        const image = new Jimp({ width: 1, height: 1, color: 0x646464ff });

        expect(adjustBrightness(image, 0.1)).to.equal(image);
        expect(pixelChannels(image)).to.deep.equal([125, 125, 125, 255]);
    });

    it("supports negative brightness and clamps channel bounds", () => {
        const darkened = new Jimp({ width: 1, height: 1, color: 0x646464ff });
        const clamped = new Jimp({ width: 1, height: 1, color: 0xfa050aff });

        adjustBrightness(darkened, -0.2);
        adjustBrightness(clamped, 0.1);

        expect(pixelChannels(darkened)).to.deep.equal([49, 49, 49, 255]);
        expect(pixelChannels(clamped)).to.deep.equal([255, 30, 35, 255]);
    });

    it("rejects non-finite or out-of-range brightness amounts", () => {
        const image = new Jimp({ width: 1, height: 1, color: 0x646464ff });

        expect(() => adjustBrightness(image, Number.NaN)).to.throw(RangeError);
        expect(() => adjustBrightness(image, 1.01)).to.throw(RangeError);
        expect(() => adjustBrightness(image, -1.01)).to.throw(RangeError);
    });
});
