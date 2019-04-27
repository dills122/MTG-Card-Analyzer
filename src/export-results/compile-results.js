const _ = require('lodash');
const {
    Search
} = require('../scryfall-api/index');

async function GatherInfo(name) {
    let results = await Search.SearchList(name);
    if(results.length > 0) {
        return {
            name: name,
            sets: GatherSets(results)
        };
    } else if(results.length === 1) {
        let card = results[0];
        return {
            name: card.name,
            set: card.set,
            type: card['type_line']
        };
    } else {
        return {
            error: 'No results found'
        };
    }
}

function GatherSets(cards) {
    return _.map(cards,'set');
}

module.exports = {
    GatherInfo,
    GatherSets
}