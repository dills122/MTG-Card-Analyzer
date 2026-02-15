import request from "request-promise-native";
import apiConfig from "./api.config.mjs";
import log from "../logger/log.mjs";

const logger = log.create({
    isPretty: true
});
const dependencies = {
    request
};

const REQUEST_HEADERS = {
    "User-Agent": "MTG-Card-Analyzer/0.2 (+https://github.com/dills122/MTG-Card-Analyzer)",
    Accept: "application/json"
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
            uri: encodeURI(`${apiConfig.templates.fuzzy}${exact}`),
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
