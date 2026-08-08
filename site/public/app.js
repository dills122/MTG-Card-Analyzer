const form = document.querySelector("#submission-form");
const imageInput = document.querySelector("#image");
const dropZone = document.querySelector(".drop-zone");
const uploadPreview = document.querySelector("#upload-preview");
const uploadName = document.querySelector("#upload-name");
const uploadDetails = document.querySelector("#upload-details");
const sourceModeInputs = [...document.querySelectorAll('input[name="sourceMode"]')];
const scryfallLookup = document.querySelector("#scryfall-lookup");
const cardSearch = document.querySelector("#card-search");
const cardSuggestions = document.querySelector("#card-suggestions");
const lookupButton = document.querySelector("#lookup-button");
const lookupStatus = document.querySelector("#lookup-status");
const printingField = document.querySelector("#printing-field");
const printingSelect = document.querySelector("#printing");
const referenceImage = document.querySelector("#reference-image");
const referencePlaceholder = document.querySelector("#reference-placeholder");
const submitButton = document.querySelector("#submit-button");
const submissionStatus = document.querySelector("#submission-status");
const turnstileContainer = document.querySelector("#turnstile-container");

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_SUBMISSION_STATUS = "Submissions are private until a maintainer reviews them.";

let previewUrl;
let autocompleteTimer;
let autocompleteRequest;
let availablePrints = [];
let turnstileWidgetId;

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function setLookupStatus(message, isError = false) {
    lookupStatus.textContent = message;
    lookupStatus.classList.toggle("is-error", isError);
}

function setSubmissionStatus(message, state) {
    submissionStatus.textContent = message;
    submissionStatus.classList.toggle("is-success", state === "success");
    submissionStatus.classList.toggle("is-error", state === "error");
}

function fieldErrorElement(field) {
    return document.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
}

function setFieldError(field, message) {
    const control = form.elements.namedItem(field);
    const error = fieldErrorElement(field);
    if (!error) return;

    error.textContent = message;
    error.id = `${field}-error`;
    if (control instanceof HTMLElement) {
        control.setAttribute("aria-invalid", message ? "true" : "false");
        if (message) control.setAttribute("aria-describedby", error.id);
        else control.removeAttribute("aria-describedby");
    }
}

function clearFieldErrors() {
    for (const error of document.querySelectorAll("[data-error-for]")) {
        setFieldError(error.dataset.errorFor, "");
    }
}

function showServerErrors(fields = {}) {
    let firstControl;
    for (const [field, message] of Object.entries(fields)) {
        setFieldError(field, message);
        const control = form.elements.namedItem(field);
        if (!firstControl && control instanceof HTMLElement) firstControl = control;
    }
    firstControl?.focus();
}

function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    uploadPreview.querySelector("img")?.remove();
    if (!uploadPreview.querySelector(".preview-placeholder")) {
        const placeholder = document.createElement("div");
        placeholder.className = "preview-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        uploadPreview.prepend(placeholder);
    }
    uploadName.textContent = "No image selected";
    uploadDetails.textContent = "Your preview will appear here.";
}

function showSelectedFile(file) {
    setFieldError("image", "");
    if (!file) {
        clearPreview();
        return;
    }
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        clearPreview();
        setFieldError("image", "Upload a JPEG, PNG, or WebP image.");
        return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
        clearPreview();
        setFieldError("image", "Image must be 10 MiB or smaller.");
        return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    uploadPreview.querySelector(".preview-placeholder")?.remove();
    let image = uploadPreview.querySelector("img");
    if (!image) {
        image = document.createElement("img");
        image.alt = "Preview of the selected card photo";
        uploadPreview.prepend(image);
    }
    image.src = previewUrl;
    uploadName.textContent = file.name;
    uploadDetails.textContent = `${formatBytes(file.size)} · ${file.type.replace("image/", "").toUpperCase()}`;
}

function updateEntryMode() {
    const mode = sourceModeInputs.find((input) => input.checked)?.value || "manual";
    scryfallLookup.hidden = mode === "manual";
    if (mode === "manual") {
        document.querySelector("#scryfallId").value = "";
        document.querySelector("#scryfallUri").value = "";
    }
}

function resetPrintingResults() {
    availablePrints = [];
    printingSelect.replaceChildren(new Option("Select a printing", ""));
    printingField.hidden = true;
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || "The request could not be completed.");
    }
    return payload;
}

async function loadAutocomplete() {
    const query = cardSearch.value.trim();
    if (query.length < 2) {
        cardSuggestions.replaceChildren();
        setLookupStatus("Type at least two characters for suggestions.");
        return;
    }

    autocompleteRequest?.abort();
    autocompleteRequest = new AbortController();
    setLookupStatus("Finding card names…");
    try {
        const payload = await fetchJson(`/api/cards/autocomplete?q=${encodeURIComponent(query)}`, {
            signal: autocompleteRequest.signal
        });
        cardSuggestions.replaceChildren(
            ...payload.data.map((name) => {
                const option = document.createElement("option");
                option.value = name;
                return option;
            })
        );
        setLookupStatus(
            payload.data.length
                ? `${payload.data.length} card name suggestions available.`
                : "No card names found. Try another spelling."
        );
    } catch (error) {
        if (error.name !== "AbortError") {
            setLookupStatus(error.message || "Card suggestions are unavailable.", true);
        }
    }
}

async function loadPrintings() {
    const name = cardSearch.value.trim();
    if (name.length < 2) {
        setLookupStatus("Enter at least two characters before finding printings.", true);
        cardSearch.focus();
        return;
    }

    clearTimeout(autocompleteTimer);
    autocompleteRequest?.abort();
    lookupButton.disabled = true;
    lookupButton.textContent = "Finding…";
    resetPrintingResults();
    setLookupStatus(`Finding printings of ${name}…`);
    try {
        const payload = await fetchJson(`/api/cards/prints?name=${encodeURIComponent(name)}`);
        availablePrints = payload.data;
        printingSelect.replaceChildren(
            new Option("Select a printing", ""),
            ...availablePrints.map(
                (card, index) =>
                    new Option(
                        `${card.setName} · ${card.setCode} · ${card.collectorNumber}`,
                        String(index)
                    )
            )
        );
        printingField.hidden = availablePrints.length === 0;
        setLookupStatus(
            availablePrints.length
                ? `${availablePrints.length} printings found. Choose the one in your photo.`
                : "No printings found. Switch to manual entry to continue.",
            availablePrints.length === 0
        );
        if (availablePrints.length) printingSelect.focus();
    } catch (error) {
        setLookupStatus(error.message || "Print lookup is unavailable.", true);
    } finally {
        lookupButton.disabled = false;
        lookupButton.textContent = "Find printings";
    }
}

function applyPrinting(card) {
    const values = {
        name: card.name,
        setCode: card.setCode,
        setName: card.setName,
        collectorNumber: card.collectorNumber,
        typeLine: card.typeLine,
        rarity: card.rarity,
        scryfallId: card.id,
        scryfallUri: card.scryfallUri || ""
    };
    for (const [field, value] of Object.entries(values)) {
        const control = form.elements.namedItem(field);
        if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
            control.value = value;
            setFieldError(field, "");
        }
    }

    if (card.imageUrl) {
        referenceImage.src = card.imageUrl;
        referenceImage.alt = `${card.name} — ${card.setName} reference image`;
        referenceImage.hidden = false;
        referencePlaceholder.hidden = true;
    } else {
        referenceImage.hidden = true;
        referencePlaceholder.hidden = false;
        referencePlaceholder.textContent = "This printing does not include a reference image.";
    }
}

function resetTurnstile() {
    if (turnstileWidgetId !== undefined && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId);
    }
}

async function loadTurnstile() {
    try {
        const config = await fetchJson("/api/config");
        if (!config.turnstileSiteKey) return;

        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.defer = true;
            script.addEventListener("load", resolve, { once: true });
            script.addEventListener("error", reject, { once: true });
            document.head.append(script);
        });
        turnstileWidgetId = window.turnstile.render(turnstileContainer, {
            sitekey: config.turnstileSiteKey,
            action: "fixture_submission",
            theme: "light"
        });
    } catch {
        // Local development intentionally runs without Turnstile unless keys are configured.
    }
}

imageInput.addEventListener("change", () => showSelectedFile(imageInput.files[0]));
for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("is-dragging");
    });
}
for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("is-dragging");
    });
}
dropZone.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    imageInput.files = files;
    showSelectedFile(files[0]);
});

for (const input of sourceModeInputs) input.addEventListener("change", updateEntryMode);
cardSearch.addEventListener("input", () => {
    clearTimeout(autocompleteTimer);
    autocompleteTimer = setTimeout(loadAutocomplete, 250);
});
cardSearch.addEventListener("change", () => {
    if (cardSearch.value.trim().length >= 2) loadPrintings();
});
lookupButton.addEventListener("click", loadPrintings);
printingSelect.addEventListener("change", () => {
    const index = Number.parseInt(printingSelect.value, 10);
    if (Number.isInteger(index) && availablePrints[index]) applyPrinting(availablePrints[index]);
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors();
    setSubmissionStatus(DEFAULT_SUBMISSION_STATUS);
    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    submitButton.textContent = "Sending…";
    setSubmissionStatus("Uploading the original image and metadata…");
    try {
        const response = await fetch("/api/submissions", {
            method: "POST",
            body: new FormData(form)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            showServerErrors(payload?.error?.fields);
            throw new Error(payload?.error?.message || "The contribution could not be sent.");
        }

        form.reset();
        clearPreview();
        resetPrintingResults();
        updateEntryMode();
        referenceImage.hidden = true;
        referencePlaceholder.hidden = false;
        referencePlaceholder.textContent = "Choose a printing to see its reference image.";
        resetTurnstile();
        setSubmissionStatus(
            `Contribution ${payload.id.slice(0, 8)} received and queued for review. Thank you.`,
            "success"
        );
    } catch (error) {
        resetTurnstile();
        setSubmissionStatus(error.message || "The contribution could not be sent.", "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Send contribution";
    }
});

updateEntryMode();
loadTurnstile();
