import { writeFile } from "node:fs/promises";

const SCRYFALL_API_ORIGIN = "https://api.scryfall.com";
const DEFAULT_MAX_PAGES = 20;
const MAX_PAGES = 100;
const REQUEST_DELAY_MS = 125;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_API_RESPONSE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const REQUEST_HEADERS = {
    "User-Agent": "MTG-Card-Analyzer/0.2 (+https://github.com/dills122/MTG-Card-Analyzer)",
    Accept: "application/json"
};

function parseMaxPages(value) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > MAX_PAGES) {
        throw new Error(`max-pages must be an integer from 1 to ${MAX_PAGES}`);
    }
    return number;
}

function buildCardSearchUrl(options) {
    const filters = ["game:paper", "lang:en"];
    if (options.setCodes.length > 0) {
        filters.push(`(${options.setCodes.map((setCode) => `e:${setCode}`).join(" OR ")})`);
    } else {
        if (options.releasedAfter) filters.push(`date>=${options.releasedAfter}`);
        if (options.releasedBefore) filters.push(`date<=${options.releasedBefore}`);
    }
    if (options.layouts?.length > 0) {
        filters.push(`(${options.layouts.map((layout) => `layout:${layout}`).join(" OR ")})`);
    }
    if (options.styles?.length > 0) {
        const styleFilters = {
            "full-art": "is:fullart",
            borderless: "border:borderless",
            showcase: "frame:showcase",
            "extended-art": "frame:extendedart",
            textless: "is:textless"
        };
        filters.push(`(${options.styles.map((style) => styleFilters[style]).join(" OR ")})`);
    }

    const url = new URL("/cards/search", SCRYFALL_API_ORIGIN);
    url.searchParams.set("q", filters.join(" "));
    url.searchParams.set("unique", "prints");
    url.searchParams.set("order", "released");
    url.searchParams.set("dir", "desc");
    return url.href;
}

function trustedUrl(value, expectedOrigin, label) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`Invalid ${label} URL`);
    }
    if (url.protocol !== "https:" || url.origin !== expectedOrigin) {
        throw new Error(`Untrusted ${label} URL: ${url.origin}`);
    }
    return url;
}

function imageUrlForCard(card, face = "front") {
    const faceIndex = face === "back" ? 1 : 0;
    const imageUrl =
        face === "back"
            ? card?.card_faces?.[faceIndex]?.image_uris?.normal
            : card?.image_uris?.normal || card?.card_faces?.[faceIndex]?.image_uris?.normal;
    if (typeof imageUrl !== "string") return undefined;
    let parsed;
    try {
        parsed = new URL(imageUrl);
    } catch {
        return undefined;
    }
    if (
        parsed.protocol !== "https:" ||
        (parsed.hostname !== "img.scryfall.com" && !parsed.hostname.endsWith(".scryfall.io"))
    ) {
        return undefined;
    }
    return parsed.href;
}

async function readBoundedBody(response, maximumBytes, label) {
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
        throw new Error(`${label} exceeds ${maximumBytes} bytes`);
    }
    if (!response.body) throw new Error(`${label} response body is empty`);

    const chunks = [];
    let total = 0;
    const reader = response.body.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maximumBytes) {
                await reader.cancel();
                throw new Error(`${label} exceeds ${maximumBytes} bytes`);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function request(url, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const response = await fetchImpl(url, {
        headers: options.headers,
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) {
        throw new Error(`Scryfall request failed with HTTP ${response.status}`);
    }
    return response;
}

function withPageParam(url, page) {
    const next = new URL(url);
    if (page && page > 1) next.searchParams.set("page", String(page));
    return next.href;
}

async function fetchPage(url, options) {
    const response = await request(url, {
        fetchImpl: options.fetchImpl,
        headers: REQUEST_HEADERS
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error("Expected JSON response from Scryfall API");
    }
    const bytes = await readBoundedBody(response, MAX_API_RESPONSE_BYTES, "Scryfall API response");
    let pageData;
    try {
        pageData = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
        throw new Error("Scryfall API returned invalid JSON", { cause: error });
    }
    if (pageData?.object !== "list" || !Array.isArray(pageData.data)) {
        throw new Error("Scryfall API response is not a card list");
    }
    return pageData;
}

async function fetchCardPages(searchUrl, options = {}) {
    const maxPages = parseMaxPages(options.maxPages ?? DEFAULT_MAX_PAGES);
    const wait =
        options.wait ||
        ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const cards = [];
    let nextUrl = withPageParam(
        trustedUrl(searchUrl, SCRYFALL_API_ORIGIN, "Scryfall API").href,
        options.startPage
    );

    for (let page = 0; page < maxPages && nextUrl; page += 1) {
        if (page > 0) await wait(REQUEST_DELAY_MS);
        const pageData = await fetchPage(nextUrl, options);
        cards.push(...pageData.data);
        if (options.shouldStop?.(cards)) break;
        nextUrl = pageData.has_more
            ? trustedUrl(pageData.next_page, SCRYFALL_API_ORIGIN, "Scryfall API").href
            : undefined;
    }
    return cards;
}

async function fetchResultCount(searchUrl, options = {}) {
    const pageData = await fetchPage(
        trustedUrl(searchUrl, SCRYFALL_API_ORIGIN, "Scryfall API").href,
        options
    );
    const pageSize = pageData.data.length;
    const totalCards = Number.isFinite(pageData.total_cards) ? pageData.total_cards : pageSize;
    return { totalCards, pageSize };
}

async function downloadImage(imageUrl, destination, options = {}) {
    const trustedImage = imageUrlForCard({ image_uris: { normal: imageUrl } });
    if (!trustedImage) throw new Error("Untrusted Scryfall image URL");
    const response = await request(trustedImage, {
        fetchImpl: options.fetchImpl,
        headers: {
            ...REQUEST_HEADERS,
            Accept: "image/jpeg"
        }
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/jpeg")) {
        throw new Error("Expected JPEG image from Scryfall");
    }
    const bytes = await readBoundedBody(response, MAX_IMAGE_BYTES, "Scryfall image");
    if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
        throw new Error("Scryfall download is not a valid JPEG image");
    }
    await writeFile(destination, bytes, { flag: "wx" });
}

export { buildCardSearchUrl, downloadImage, fetchCardPages, fetchResultCount, imageUrlForCard };
