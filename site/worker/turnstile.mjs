const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TOKEN_MAX_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5000;

export async function verifyTurnstile(form, request, secret, fetchImpl) {
    if (!secret) return { valid: true };

    const token = form.get("cf-turnstile-response");
    if (typeof token !== "string" || !token || token.length > TOKEN_MAX_LENGTH) {
        return { valid: false, unavailable: false };
    }

    const body = { secret, response: token };
    const remoteIp = request.headers.get("cf-connecting-ip");
    if (remoteIp) body.remoteip = remoteIp;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
        const response = await fetchImpl(
            new Request(SITEVERIFY_URL, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal
            })
        );
        if (!response.ok) return { valid: false, unavailable: true };
        const result = await response.json();
        return {
            valid:
                result?.success === true &&
                (!result.action || result.action === "fixture_submission"),
            unavailable: false
        };
    } catch {
        return { valid: false, unavailable: true };
    } finally {
        clearTimeout(timeout);
    }
}
