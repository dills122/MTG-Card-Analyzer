const creatureTypes = require('../data/creatureTypes');
const cardTypes = require('../data/cardTypes');
const FuzzySet = require('fuzzyset.js');

function CheckForCreatureType(cleanText) {
    let fuzzy = FuzzySet(creatureTypes);
    if (!cleanText.match(/[\s]/g)) {
        let result = fuzzy.get(cleanText) || [];
        return result.length > 0 ? [
            [result[0][0], 'Creature']
        ] : [];
    }
    let subStrs = cleanText.split(' ') || [];
    let percentage = 0;
    let isCreature = subStrs.some((subName) => {
        let result = fuzzy.get(subName) || [];
        if(result.length > 0) {
            percentage = result[0][0] || 0;
            return true;
        }
        return false;
    });
    return isCreature ? [
        [percentage, 'Creature']
    ] : [];
}

function CheckForBaseType(cleanText) {
    let fuzzy = FuzzySet(cardTypes);
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
    CheckForCreatureType,
    CheckForBaseType
}