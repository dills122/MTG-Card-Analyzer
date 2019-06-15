const request = require('request-promise-native');

const dependencies = {
    request
};

const baseUrl = 'https://api.scryfall.com';

async function GetCardNames() {
    try {
        let response = await dependencies.request(`${baseUrl}/catalog/card-names`);
        if (response) {
            let names = JSON.parse(response).data || [];
            return names;
        }
        return [];
    } catch (err) {
        console.log(err);
    }
}

module.exports = {
    GetCardNames,
    dependencies
}