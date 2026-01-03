const request = require('request-promise-native');
const log = require('../logger/log');
const logger = log.create({
    isPretty: true
});
const dependencies = {
    request
};

const baseUrl = 'https://api.scryfall.com';

const REQUEST_HEADERS = {
    'User-Agent': 'MTG-Card-Analyzer/0.2 (+https://github.com/dills122/MTG-Card-Analyzer)',
    'Accept': 'application/json'
};

async function GetCardNames() {
    try {
        let response = await dependencies.request({
            uri: `${baseUrl}/catalog/card-names`,
            headers: REQUEST_HEADERS
        });
        if (response) {
            let names = JSON.parse(response).data || [];
            return names;
        }
        return [];
    } catch (err) {
        logger.error(err);
        return [];
    }
}

module.exports = {
    GetCardNames,
    dependencies
}
