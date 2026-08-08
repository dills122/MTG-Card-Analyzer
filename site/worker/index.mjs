import {
    imageMatchesContentType,
    parseSubmissionForm,
    SubmissionValidationError
} from "./submission.mjs";
import { autocompleteCards, findCardPrints, ScryfallRequestError } from "./scryfall.mjs";
import { verifyTurnstile } from "./turnstile.mjs";

const INSERT_SUBMISSION = `
    INSERT INTO submissions (
        id, status, image_key, image_type, image_size, original_filename,
        card_name, set_code, set_name, collector_number, type_line, rarity,
        quality, source_mode, scryfall_id, scryfall_uri, notes, created_at
    ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
        ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18
    )
`;

const SECURITY_HEADERS = {
    "content-security-policy": [
        "default-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self' https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com",
        "connect-src 'self' https://challenges.cloudflare.com",
        "img-src 'self' blob: data: https://cards.scryfall.io",
        "style-src 'self'",
        "upgrade-insecure-requests"
    ].join("; "),
    "permissions-policy": "camera=(), geolocation=(), microphone=()",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
};

function applySecurityHeaders(headers) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
}

function json(data, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    applySecurityHeaders(headers);
    return Response.json(data, { ...init, headers });
}

function errorResponse(status, code, message, fields) {
    const error = { code, message };
    if (fields) error.fields = fields;
    return json({ error }, { status });
}

function extensionFor(contentType) {
    return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[contentType];
}

function storageKey(id, createdAt, contentType) {
    const date = new Date(createdAt);
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `submissions/${year}/${month}/${id}.${extensionFor(contentType)}`;
}

async function createSubmission(request, env, dependencies) {
    if (!env.SUBMISSION_IMAGES || !env.SUBMISSIONS_DB) {
        return errorResponse(503, "storage_unavailable", "Submission storage is not configured.");
    }
    const hostname = new URL(request.url).hostname;
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
    if (!env.TURNSTILE_SECRET_KEY && !isLocal) {
        return errorResponse(
            503,
            "verification_not_configured",
            "Submissions are unavailable until anti-spam verification is configured."
        );
    }

    let parsed;
    let form;
    try {
        form = await request.formData();
        parsed = parseSubmissionForm(form);
    } catch (error) {
        if (error instanceof SubmissionValidationError) {
            return errorResponse(400, "invalid_submission", error.message, error.fields);
        }
        return errorResponse(400, "invalid_form", "Submit the form as multipart form data.");
    }

    const verification = await verifyTurnstile(
        form,
        request,
        env.TURNSTILE_SECRET_KEY,
        dependencies.fetch
    );
    if (!verification.valid) {
        if (verification.unavailable) {
            return errorResponse(
                503,
                "verification_unavailable",
                "Verification is temporarily unavailable. Try again."
            );
        }
        return errorResponse(
            400,
            "verification_required",
            "Complete the anti-spam verification and try again."
        );
    }

    const imageBytes = await parsed.image.arrayBuffer();
    if (!imageMatchesContentType(imageBytes, parsed.image.type)) {
        return errorResponse(400, "invalid_submission", "Submission validation failed.", {
            image: "Image contents do not match the selected file type."
        });
    }

    const id = dependencies.randomUUID();
    const createdAt = dependencies.now();
    const { image, metadata } = parsed;
    const key = storageKey(id, createdAt, image.type);

    try {
        await env.SUBMISSION_IMAGES.put(key, imageBytes, {
            httpMetadata: { contentType: image.type },
            customMetadata: { submissionId: id, status: "pending" }
        });
        await env.SUBMISSIONS_DB.prepare(INSERT_SUBMISSION)
            .bind(
                id,
                "pending",
                key,
                image.type,
                image.size,
                image.name,
                metadata.name,
                metadata.setCode,
                metadata.setName,
                metadata.collectorNumber,
                metadata.typeLine,
                metadata.rarity,
                metadata.quality,
                metadata.sourceMode,
                metadata.scryfallId,
                metadata.scryfallUri,
                metadata.notes,
                createdAt
            )
            .run();
    } catch (error) {
        try {
            await env.SUBMISSION_IMAGES.delete(key);
        } catch {
            console.error("Failed to remove an orphaned submission image", { submissionId: id });
        }
        console.error("Failed to store submission", {
            submissionId: id,
            errorName: error instanceof Error ? error.name : "UnknownError"
        });
        return errorResponse(
            503,
            "storage_failed",
            "The submission could not be saved. Try again."
        );
    }

    return json({ id, status: "pending" }, { status: 201 });
}

async function cardsRequest(url, dependencies) {
    try {
        if (url.pathname === "/api/cards/autocomplete") {
            return json(
                await autocompleteCards(url.searchParams.get("q") || "", dependencies.fetch),
                {
                    headers: { "cache-control": "public, max-age=3600" }
                }
            );
        }
        return json(await findCardPrints(url.searchParams.get("name") || "", dependencies.fetch), {
            headers: { "cache-control": "public, max-age=3600" }
        });
    } catch (error) {
        if (error instanceof ScryfallRequestError) {
            return errorResponse(error.status, "card_lookup_failed", error.message);
        }
        return errorResponse(502, "card_lookup_failed", "Card lookup is temporarily unavailable.");
    }
}

export async function handleRequest(
    request,
    env,
    context,
    dependencies = {
        fetch,
        randomUUID: () => crypto.randomUUID(),
        now: () => new Date().toISOString()
    }
) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/config") {
        return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
    }
    if (
        request.method === "GET" &&
        ["/api/cards/autocomplete", "/api/cards/prints"].includes(url.pathname)
    ) {
        return cardsRequest(url, dependencies);
    }
    if (request.method === "POST" && url.pathname === "/api/submissions") {
        return createSubmission(request, env, dependencies);
    }
    if (url.pathname.startsWith("/api/")) {
        return errorResponse(404, "not_found", "API route not found.");
    }
    if (env.ASSETS) {
        const response = await env.ASSETS.fetch(request);
        const headers = new Headers(response.headers);
        applySecurityHeaders(headers);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    }
    return new Response("Not found", { status: 404 });
}

export default {
    fetch(request, env, context) {
        return handleRequest(request, env, context);
    }
};
