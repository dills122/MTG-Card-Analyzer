import log from "../logger/log.mjs";
import { request, REQUEST_HEADERS } from "./http-client.mjs";

const logger = log.create({
    isPretty: true
});

const dependencies = {
    request
};

const baseUrl = "https://api.scryfall.com";

async function GetCardNames() {
    try {
        const response = await dependencies.request({
            uri: `${baseUrl}/catalog/card-names`,
            headers: REQUEST_HEADERS
        });
        if (response) {
            const names = JSON.parse(response).data || [];
            return names;
        }
        return [];
    } catch (err) {
        logger.error(err);
        return [];
    }
}

export { GetCardNames, dependencies };

export default {
    GetCardNames,
    dependencies
};
