const _ = require('lodash');
const {
    Search
} = require('../scryfall-api/index');

const matchThreshold = 65;
const closeMatchThreshold = 55;

async function GatherInfo(name) {
    let results = await Search.SearchList(name);
    if (results.length > 0) {
        return {
            name: name,
            sets: GatherSets(results)
        };
    } else if (results.length === 1) {
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
    return _.map(cards, 'set');
}

function GatherNameFromFuzzy(fuzzyMatches) {
    if (fuzzyMatches.length === 0) {
        return {
            error: 'no matches'
        };
    }
    if (fuzzyMatches.length === 1 || fuzzyMatches[0][0] >= matchThreshold) {
        //Returns name
        return {
            name: fuzzyMatches[0][1]
        };
    }
    let matchOne = fuzzyMatches[0];
    let matchTwo = fuzzyMatches[1];
    let closeMatchMean = _.mean([matchOne[0], matchTwo[0]])
    if((matchOne[0] >= closeMatchThreshold && matchOne[1] >= closeMatchThreshold)|| closeMatchMean >= closeMatchThreshold) {
        return {
            error: 'close match'
        };
    }
}

module.exports = {
    GatherNameFromFuzzy,
    GatherInfo,
    GatherSets,
}