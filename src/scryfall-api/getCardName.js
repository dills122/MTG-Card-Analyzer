const request = require('request-promise-native');

const baseUrl = 'https://api.scryfall.com';

async function GetCardNames() {
    try {
        let response = await request(`${baseUrl}/catalog/card-names`);
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
    GetCardNames
}