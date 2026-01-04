import creatureTypes from "../data/creatureTypes.mjs";
import cardTypes from "../data/cardTypes.mjs";
import FuzzySet from "fuzzyset.js";

function CheckForCreatureType(cleanText) {
    const fuzzy = FuzzySet(creatureTypes);
    if (!cleanText.match(/[\s]/g)) {
        const result = fuzzy.get(cleanText) || [];
        return result.length > 0 ? [[result[0][0], "Creature"]] : [];
    }
    const subStrs = cleanText.split(" ") || [];
    let percentage = 0;
    const isCreature = subStrs.some((subName) => {
        const result = fuzzy.get(subName) || [];
        if (result.length > 0) {
            percentage = result[0][0] || 0;
            return true;
        }
        return false;
    });
    return isCreature ? [[percentage, "Creature"]] : [];
}

function CheckForBaseType(cleanText = "") {
    if (cleanText) {
        const fuzzy = FuzzySet(cardTypes);
        if (!cleanText.match(/[\s]/g)) {
            return fuzzy.get(cleanText) || [];
        }
        const subStrs = cleanText.split(" ") || [];
        let results = [];
        subStrs.forEach((subName) => {
            const result = fuzzy.get(subName);
            if (result) {
                const tmp = results.concat(result);
                results = tmp;
            }
        });
        return results;
    }
    return [];
}

export { CheckForCreatureType, CheckForBaseType };

export default {
    CheckForCreatureType,
    CheckForBaseType
};
