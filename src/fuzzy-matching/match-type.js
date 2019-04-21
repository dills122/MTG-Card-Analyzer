const types = require('../data/cardTypes');
const FuzzySet = require('fuzzyset.js');

function MatchType(cleanText, dirtyText = '') {
    //TODO improve searching by spliting on spaces and checking each subString
    let fuzzy = FuzzySet(types);
    if(!cleanText.match(/[\s]/g)) {
        return fuzzy.get(cleanText);
    }
    let subStrs = cleanText.split(' ') || [];
    let results = [];
    subStrs.forEach((subName) => {
        let result = fuzzy.get(subName);
        if(result) {
            let tmp = results.concat(result);
            results = tmp;
        }
    });
    return results || [];
}

module.exports = {
    MatchType
}