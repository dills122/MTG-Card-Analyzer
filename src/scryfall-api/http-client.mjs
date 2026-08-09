// Shared native-fetch client for the Scryfall API modules (search-name.mjs, get-card-name.mjs) --
// both used to hand-roll their own copy of this wrapper plus an identical REQUEST_HEADERS
// constant. One implementation now.
//
// Returns response body text (not parsed JSON) so callers keep their existing
// JSON.parse-then-branch control flow unchanged from the request-promise-native days.

const REQUEST_HEADERS = {
    "User-Agent": "MTG-Card-Analyzer/0.2 (+https://github.com/dills122/MTG-Card-Analyzer)",
    Accept: "application/json"
};

async function request({ uri, headers = REQUEST_HEADERS }) {
    const response = await fetch(uri, { headers });
    if (!response.ok) {
        // Scryfall error bodies are still valid, non-empty JSON (e.g. {"object":"error",...}),
        // so callers' "empty object means not found" fallback never fires on a 4xx/5xx -- they'd
        // otherwise parse and return the error body as if it were a real card. Throwing here lets
        // every caller's existing try/catch (logger.error + empty-result fallback) handle it.
        throw new Error(`Scryfall request failed with HTTP ${response.status}`);
    }
    return response.text();
}

export { request, REQUEST_HEADERS };

export default { request, REQUEST_HEADERS };
