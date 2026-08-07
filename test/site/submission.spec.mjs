import { expect } from "chai";
import {
    MAX_IMAGE_BYTES,
    SubmissionValidationError,
    parseSubmissionForm
} from "../../site/worker/submission.mjs";

function validForm() {
    const form = new FormData();
    form.set("image", new File(["image-data"], "pacifism.jpg", { type: "image/jpeg" }));
    form.set("name", "  Pacifism  ");
    form.set("setCode", " bbd ");
    form.set("setName", " Battlebond ");
    form.set("collectorNumber", " 101 ");
    form.set("typeLine", " Enchantment — Aura ");
    form.set("rarity", "common");
    form.set("quality", "good-photo");
    form.set("sourceMode", "scryfall");
    form.set("scryfallId", "a7d9f095-7e20-48af-8140-5d79a311a623");
    form.set("scryfallUri", "https://scryfall.com/card/bbd/101/pacifism");
    form.set("notes", "  Slight glare at the lower edge.  ");
    form.set("consent", "yes");
    return form;
}

describe("test-data submission validation", () => {
    it("normalizes a complete submission without changing the uploaded file", () => {
        const form = validForm();
        const image = form.get("image");

        const submission = parseSubmissionForm(form);

        expect(submission.image).to.equal(image);
        expect(submission.metadata).to.deep.equal({
            name: "Pacifism",
            setCode: "BBD",
            setName: "Battlebond",
            collectorNumber: "101",
            typeLine: "Enchantment — Aura",
            rarity: "common",
            quality: "good-photo",
            sourceMode: "scryfall",
            scryfallId: "a7d9f095-7e20-48af-8140-5d79a311a623",
            scryfallUri: "https://scryfall.com/card/bbd/101/pacifism",
            notes: "Slight glare at the lower edge."
        });
    });

    it("accepts fully manual metadata without Scryfall identifiers", () => {
        const form = validForm();
        form.set("sourceMode", "manual");
        form.delete("scryfallId");
        form.delete("scryfallUri");

        const submission = parseSubmissionForm(form);

        expect(submission.metadata.sourceMode).to.equal("manual");
        expect(submission.metadata.scryfallId).to.equal(null);
        expect(submission.metadata.scryfallUri).to.equal(null);
    });

    it("reports required fields together", () => {
        const form = validForm();
        form.delete("name");
        form.delete("setCode");
        form.delete("collectorNumber");

        expect(() => parseSubmissionForm(form))
            .to.throw(SubmissionValidationError)
            .with.property("fields")
            .that.deep.equals({
                name: "Card name is required.",
                setCode: "Set code is required.",
                collectorNumber: "Collector number is required."
            });
    });

    it("rejects unsupported image types", () => {
        const form = validForm();
        form.set("image", new File(["not-an-image"], "card.svg", { type: "image/svg+xml" }));

        expect(() => parseSubmissionForm(form))
            .to.throw(SubmissionValidationError)
            .with.property("fields")
            .that.includes({ image: "Upload a JPEG, PNG, or WebP image." });
    });

    it("rejects images larger than the application limit", () => {
        const form = validForm();
        form.set(
            "image",
            new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "card.jpg", { type: "image/jpeg" })
        );

        expect(() => parseSubmissionForm(form))
            .to.throw(SubmissionValidationError)
            .with.property("fields")
            .that.includes({ image: "Image must be 10 MiB or smaller." });
    });

    it("requires permission to use the submitted image as a fixture", () => {
        const form = validForm();
        form.delete("consent");

        expect(() => parseSubmissionForm(form))
            .to.throw(SubmissionValidationError)
            .with.property("fields")
            .that.includes({
                consent: "Confirm that this image may be used as project test data."
            });
    });

    it("rejects unexpected option values and non-Scryfall provenance URLs", () => {
        const form = validForm();
        form.set("rarity", "priceless");
        form.set("quality", "perfect");
        form.set("scryfallUri", "https://example.com/not-scryfall");

        expect(() => parseSubmissionForm(form))
            .to.throw(SubmissionValidationError)
            .with.property("fields")
            .that.deep.equals({
                rarity: "Choose a valid rarity.",
                quality: "Choose a valid image quality.",
                scryfallUri: "Scryfall URL must point to scryfall.com."
            });
    });
});
