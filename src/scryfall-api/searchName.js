const request = require("request-promise-native");
const apiConfig = require("./api.config");
const log = require("../logger/log");
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

//These return a random/newest card if printed across sets
async function SearchByNameExact(exact, fuzzy = "") {
    try {
        let response = await dependencies.request({
            uri: encodeURI(`${apiConfig.templates.cardNameExact}${exact}`),
            headers: REQUEST_HEADERS
        });
        if (response) {
            let cardInfo = JSON.parse(response) || {};
            if (Object.keys(cardInfo).length === 0) {
                return await SearchByNameFuzzy(fuzzy);
            }
            return cardInfo;
        }
        return {};
    } catch (err) {
        logger.error(err);
    }
}

//These return a random/newest card if printed across sets
async function SearchByNameFuzzy(exact, fuzzy = "") {
    if (fuzzy === "") {
        return {};
    }
    try {
        let response = await dependencies.request({
            uri: encodeURI(`${apiConfig.templates.fuzzy}${exact}`),
            headers: REQUEST_HEADERS
        });
        if (response) {
            let cardInfo = JSON.parse(response) || {};
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
    let name = exact.replace(/ /g, "%20");
    try {
        let response = await dependencies.request({
            uri: `${apiConfig.templates.cardListExact}${name}&unique=prints`,
            headers: REQUEST_HEADERS
        });
        if (response) {
            let cardInfo = JSON.parse(response) || {};
            if (Object.keys(cardInfo).length === 0) {
                return [await SearchByNameFuzzy(name)];
            }
            return cardInfo.data;
        }
        return [];
    } catch (err) {
        logger.error(err);
    }
}

module.exports = {
    SearchByNameExact,
    SearchByNameFuzzy,
    SearchList,
    dependencies
};
