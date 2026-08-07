const SCRYFALL_BASE_URL = "https://api.scryfall.com";
const REQUEST_TIMEOUT_MS = 5000;
const REQUEST_HEADERS = {
    Accept: "application/json;q=0.9,*/*;q=0.8",
    "User-Agent": "MTG-Card-Analyzer/0.2 (+https://github.com/dills1220/MTG-Card-Analyzer)"
};

export class ScryfallRequestError extends Error {
    constructor(message, status = 502) {
        super(message);
        this.name = "ScryfallRequestError";
        this.status = status;
    }
}

async function fetchJson(url, fetchImpl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetchImpl(
            new Request(url, { headers: REQUEST_HEADERS, signal: controller.signal })
        );
        if (!response.ok) {
            throw new ScryfallRequestError("Scryfall could not complete the lookup.");
        }
        return await response.json();
    } catch (error) {
        if (error instanceof ScryfallRequestError) throw error;
        throw new ScryfallRequestError("Scryfall is temporarily unavailable.");
    } finally {
        clearTimeout(timeout);
    }
}

function requiredQuery(value, label) {
    const query = value.trim();
    if (query.length < 2 || query.length > 200) {
        throw new ScryfallRequestError(`${label} must be between 2 and 200 characters.`, 400);
    }
    return query;
}

export async function autocompleteCards(value, fetchImpl) {
    const query = requiredQuery(value, "Search query");
    const url = new URL("/cards/autocomplete", SCRYFALL_BASE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("include_extras", "false");
    const payload = await fetchJson(url, fetchImpl);
    const names = Array.isArray(payload?.data)
        ? payload.data.filter((name) => typeof name === "string").slice(0, 20)
        : [];
    return { data: names };
}

function imageUrlFor(card) {
    if (typeof card?.image_uris?.normal === "string") return card.image_uris.normal;
    if (Array.isArray(card?.card_faces)) {
        const face = card.card_faces.find((candidate) => candidate?.image_uris?.normal);
        if (typeof face?.image_uris?.normal === "string") return face.image_uris.normal;
    }
    return null;
}

function mapCard(card) {
    if (!card || typeof card !== "object") return null;
    const required = ["id", "name", "set", "set_name", "collector_number", "type_line", "rarity"];
    if (required.some((field) => typeof card[field] !== "string")) return null;
    return {
        id: card.id,
        name: card.name,
        setCode: card.set.toUpperCase(),
        setName: card.set_name,
        collectorNumber: card.collector_number,
        typeLine: card.type_line,
        rarity: card.rarity,
        scryfallUri: typeof card.scryfall_uri === "string" ? card.scryfall_uri : null,
        imageUrl: imageUrlFor(card)
    };
}

export async function findCardPrints(value, fetchImpl) {
    const name = requiredQuery(value, "Card name");
    const url = new URL("/cards/search", SCRYFALL_BASE_URL);
    url.searchParams.set("q", `!"${name.replaceAll('"', "")}"`);
    url.searchParams.set("unique", "prints");
    url.searchParams.set("order", "released");
    url.searchParams.set("dir", "desc");
    const payload = await fetchJson(url, fetchImpl);
    const cards = Array.isArray(payload?.data)
        ? payload.data.map(mapCard).filter(Boolean).slice(0, 100)
        : [];
    return { data: cards };
}
