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
    return response.text();
}

export { request, REQUEST_HEADERS };

export default { request, REQUEST_HEADERS };
