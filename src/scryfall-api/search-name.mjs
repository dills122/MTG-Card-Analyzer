import apiConfig from "./api.config.mjs";
import log from "../logger/log.mjs";
import { request, REQUEST_HEADERS } from "./http-client.mjs";

const defaultLogger = log.create({
    isPretty: true
});
const MAX_PRINT_SEARCH_PAGES = 20;

function assertScryfallPageUrl(value) {
    const url = new URL(value);
    if (url.origin !== apiConfig.base) {
        throw new Error("Scryfall pagination returned an unapproved origin");
    }
    return url.toString();
}

export function createSearchApi({ request: sendRequest = request, logger = defaultLogger } = {}) {
    // These return a random/newest card if printed across sets.
    async function searchByNameExact(exact, fuzzy = "") {
        try {
            const response = await sendRequest({
                uri: encodeURI(`${apiConfig.templates.cardNameExact}${exact}`),
                headers: REQUEST_HEADERS
            });
            if (response) {
                const cardInfo = JSON.parse(response) || {};
                if (Object.keys(cardInfo).length === 0) {
                    return await searchByNameFuzzy(fuzzy);
                }
                return cardInfo;
            }
            return {};
        } catch (err) {
            logger.error(err);
            return {};
        }
    }

    // These return a random/newest card if printed across sets.
    async function searchByNameFuzzy(exact, fuzzy = "") {
        if (fuzzy === "") {
            return {};
        }
        try {
            const response = await sendRequest({
                uri: encodeURI(`${apiConfig.templates.cardNameFuzzy}${exact}`),
                headers: REQUEST_HEADERS
            });
            if (response) {
                return JSON.parse(response) || {};
            }
            return {};
        } catch (err) {
            logger.error(err);
            return { err };
        }
    }

    async function searchList(exact) {
        const name = exact.replace(/ /g, "%20");
        try {
            let uri = `${apiConfig.templates.cardListExact}${name}&unique=prints`;
            const cards = [];
            for (let page = 0; page < MAX_PRINT_SEARCH_PAGES; page += 1) {
                const response = await sendRequest({ uri, headers: REQUEST_HEADERS });
                if (!response) {
                    break;
                }
                const cardInfo = JSON.parse(response) || {};
                if (Object.keys(cardInfo).length === 0) {
                    return [await searchByNameFuzzy(name)];
                }
                cards.push(...(Array.isArray(cardInfo.data) ? cardInfo.data : []));
                if (!cardInfo.has_more) {
                    return cards;
                }
                if (!cardInfo.next_page) {
                    throw new Error("Scryfall pagination omitted next_page");
                }
                uri = assertScryfallPageUrl(cardInfo.next_page);
            }
            if (cards.length > 0) {
                throw new Error(
                    `Scryfall print search exceeded ${MAX_PRINT_SEARCH_PAGES} pages for "${exact}"`
                );
            }
            return cards;
        } catch (err) {
            logger.error(err);
            return [];
        }
    }

    return Object.freeze({ searchByNameExact, searchByNameFuzzy, searchList });
}

const searchApi = createSearchApi();
const { searchByNameExact, searchByNameFuzzy, searchList } = searchApi;

export { searchByNameExact, searchByNameFuzzy, searchList };

export default {
    searchByNameExact,
    searchByNameFuzzy,
    searchList,
    createSearchApi
};
