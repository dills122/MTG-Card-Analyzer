import apiConfig from "./api.config.mjs";
import log from "../logger/log.mjs";
import { request, REQUEST_HEADERS } from "./http-client.mjs";

const logger = log.create({
    isPretty: true
});

const dependencies = {
    request
};

async function getCardNames() {
    try {
        const response = await dependencies.request({
            uri: apiConfig.templates.catalogCardNames,
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

export { getCardNames, dependencies };

export default {
    getCardNames,
    dependencies
};
