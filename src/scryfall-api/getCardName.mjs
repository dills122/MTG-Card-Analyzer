import log from "../logger/log.mjs";

const logger = log.create({
    isPretty: true
});

// Native fetch (Node >=20) in place of request-promise-native -- see searchName.mjs for the
// same pattern.
async function request({ uri, headers }) {
    const response = await fetch(uri, { headers });
    return response.text();
}

const dependencies = {
    request
};

const baseUrl = "https://api.scryfall.com";

const REQUEST_HEADERS = {
    "User-Agent": "MTG-Card-Analyzer/0.2 (+https://github.com/dills122/MTG-Card-Analyzer)",
    Accept: "application/json"
};

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
