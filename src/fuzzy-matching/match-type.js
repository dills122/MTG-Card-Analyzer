const types = require('../data/cardTypes');
const FuzzySet = require('fuzzyset.js');

function MatchType(cleanText, dirtyText = '') {
    //TODO improve searching by spliting on spaces and checking each subString
    let fuzzy = FuzzySet(types);
    return fuzzy.get(cleanText);
}

module.exports = {
    MatchType
}