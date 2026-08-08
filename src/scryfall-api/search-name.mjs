import apiConfig from "./api.config.mjs";
import log from "../logger/log.mjs";
import { request, REQUEST_HEADERS } from "./http-client.mjs";

const logger = log.create({
    isPretty: true
});

const dependencies = {
    request
};

// These return a random/newest card if printed across sets
async function SearchByNameExact(exact, fuzzy = "") {
    try {
        const response = await dependencies.request({
            uri: encodeURI(`${apiConfig.templates.cardNameExact}${exact}`),
            headers: REQUEST_HEADERS
        });
        if (response) {
            const cardInfo = JSON.parse(response) || {};
            if (Object.keys(cardInfo).length === 0) {
                return await SearchByNameFuzzy(fuzzy);
            }
            return cardInfo;
        }
        return {};
    } catch (err) {
        logger.error(err);
        return {};
    }
}

// These return a random/newest card if printed across sets
async function SearchByNameFuzzy(exact, fuzzy = "") {
    if (fuzzy === "") {
        return {};
    }
    try {
        const response = await dependencies.request({
            uri: encodeURI(`${apiConfig.templates.cardNameFuzzy}${exact}`),
            headers: REQUEST_HEADERS
        });
        if (response) {
            const cardInfo = JSON.parse(response) || {};
            return cardInfo;
        }
        return {};
    } catch (err) {
        logger.error(err);
        return {
            err
        };
    }
}

async function SearchList(exact) {
    const name = exact.replace(/ /g, "%20");
    try {
        const response = await dependencies.request({
            uri: `${apiConfig.templates.cardListExact}${name}&unique=prints`,
            headers: REQUEST_HEADERS
        });
        if (response) {
            const cardInfo = JSON.parse(response) || {};
            if (Object.keys(cardInfo).length === 0) {
                return [await SearchByNameFuzzy(name)];
            }
            return cardInfo.data;
        }
        return [];
    } catch (err) {
        logger.error(err);
        return [];
    }
}

export { SearchByNameExact, SearchByNameFuzzy, SearchList, dependencies };

export default {
    SearchByNameExact,
    SearchByNameFuzzy,
    SearchList,
    dependencies
};
