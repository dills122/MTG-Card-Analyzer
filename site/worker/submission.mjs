export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const RARITIES = new Set(["common", "uncommon", "rare", "mythic", "special", "bonus"]);
const QUALITIES = new Set([
    "clean-scan",
    "good-photo",
    "average-photo",
    "poor-lighting",
    "blur",
    "rotation",
    "cropping",
    "low-resolution"
]);
const SOURCE_MODES = new Set(["manual", "scryfall"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SubmissionValidationError extends Error {
    constructor(fields) {
        super("Submission validation failed.");
        this.name = "SubmissionValidationError";
        this.fields = fields;
    }
}

function textValue(form, field) {
    const value = form.get(field);
    return typeof value === "string" ? value.trim() : "";
}

function requiredText(form, field, label, maxLength, errors) {
    const value = textValue(form, field);
    if (!value) {
        errors[field] = `${label} is required.`;
    } else if (value.length > maxLength) {
        errors[field] = `${label} must be ${maxLength} characters or fewer.`;
    }
    return value;
}

function optionalText(form, field, label, maxLength, errors) {
    const value = textValue(form, field);
    if (value.length > maxLength) {
        errors[field] = `${label} must be ${maxLength} characters or fewer.`;
    }
    return value || null;
}

function validateScryfallUri(value, errors) {
    if (!value) return;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.hostname !== "scryfall.com") {
            errors.scryfallUri = "Scryfall URL must point to scryfall.com.";
        }
    } catch {
        errors.scryfallUri = "Scryfall URL must point to scryfall.com.";
    }
}

export function parseSubmissionForm(form) {
    const errors = {};
    const image = form.get("image");

    if (!(image instanceof Blob) || !("name" in image) || image.size === 0) {
        errors.image = "Choose an image to upload.";
    } else if (!IMAGE_TYPES.has(image.type)) {
        errors.image = "Upload a JPEG, PNG, or WebP image.";
    } else if (image.size > MAX_IMAGE_BYTES) {
        errors.image = "Image must be 10 MiB or smaller.";
    }

    const name = requiredText(form, "name", "Card name", 200, errors);
    const setCode = requiredText(form, "setCode", "Set code", 12, errors).toUpperCase();
    const setName = requiredText(form, "setName", "Set name", 160, errors);
    const collectorNumber = requiredText(form, "collectorNumber", "Collector number", 40, errors);
    const typeLine = requiredText(form, "typeLine", "Type line", 300, errors);
    const rarity = textValue(form, "rarity");
    const quality = textValue(form, "quality");
    const sourceMode = textValue(form, "sourceMode") || "manual";
    const scryfallId = optionalText(form, "scryfallId", "Scryfall ID", 36, errors);
    const scryfallUri = optionalText(form, "scryfallUri", "Scryfall URL", 500, errors);
    const notes = optionalText(form, "notes", "Notes", 2000, errors);

    if (!RARITIES.has(rarity)) errors.rarity = "Choose a valid rarity.";
    if (!QUALITIES.has(quality)) errors.quality = "Choose a valid image quality.";
    if (!SOURCE_MODES.has(sourceMode)) errors.sourceMode = "Choose a valid entry mode.";
    if (scryfallId && !UUID_PATTERN.test(scryfallId)) {
        errors.scryfallId = "Scryfall ID must be a valid UUID.";
    }
    validateScryfallUri(scryfallUri, errors);
    if (textValue(form, "consent") !== "yes") {
        errors.consent = "Confirm that this image may be used as project test data.";
    }

    if (Object.keys(errors).length > 0) throw new SubmissionValidationError(errors);

    return {
        image,
        metadata: {
            name,
            setCode,
            setName,
            collectorNumber,
            typeLine,
            rarity,
            quality,
            sourceMode,
            scryfallId,
            scryfallUri,
            notes
        }
    };
}
