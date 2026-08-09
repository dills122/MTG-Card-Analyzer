import apiConfig from "./api.config.mjs";
import log from "../logger/log.mjs";
import { request, REQUEST_HEADERS } from "./http-client.mjs";

const defaultLogger = log.create({
    isPretty: true
});

export function createCardNameApi({ request: sendRequest = request, logger = defaultLogger } = {}) {
    async function getCardNames() {
        try {
            const response = await sendRequest({
                uri: apiConfig.templates.catalogCardNames,
                headers: REQUEST_HEADERS
            });
            if (response) {
                return JSON.parse(response).data || [];
            }
            return [];
        } catch (err) {
            logger.error(err);
            return [];
        }
    }

    return Object.freeze({ getCardNames });
}

const cardNameApi = createCardNameApi();
const { getCardNames } = cardNameApi;

export { getCardNames };

export default {
    getCardNames,
    createCardNameApi
};
