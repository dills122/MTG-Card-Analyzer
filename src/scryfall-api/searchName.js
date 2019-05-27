
const request = require('request-promise-native');
const apiConfig = require('./api.config');

//These return a random/newest card if printed across sets
async function SearchByNameExact(exact, fuzzy= '') {
    try {
        let response = await request(encodeURI(`${apiConfig.templates.cardNameExact}${exact}`));
        if (response) {
            let cardInfo = JSON.parse(response) || {};
            if(Object.keys(cardInfo).length === 0) {
                return await SearchByNameFuzzy(fuzzy);
            }
            return cardInfo;
        }
        return {};
    } catch (err) {
        console.log(err);
    }
}

//These return a random/newest card if printed across sets
async function SearchByNameFuzzy(exact, fuzzy= '') {
    if(fuzzy === '') {
        return {};
    }
    try {
        let response = await request(encodeURI(`${apiConfig.templates.fuzzy}${exact}`));
        if (response) {
            let cardInfo = JSON.parse(response) || {};
            return cardInfo;
        }
        return {};
    } catch (err) {
        console.log(err);
        return {
            err
        };
    }
}

async function SearchList(exact) {
    let name = exact.replace(/ /g, '%20');
    try {
        let response = await request(`${apiConfig.templates.cardListExact}${name}&unique=prints`);
        if (response) {
            let cardInfo = JSON.parse(response) || {};
            if(Object.keys(cardInfo).length === 0) {
                return [await SearchByNameFuzzy(fuzzy)];
            }
            return cardInfo.data;
        }
        return [];
    } catch (err) {
        console.log(err);
    }
}

module.exports = {
    SearchByNameExact,
    SearchByNameFuzzy,
    SearchList
}
