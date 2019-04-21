const {
    CheckForBaseType,
    CheckForCreatureType
} = require('./type-mapping');

//Currently Creatures take precedence since they are a more common type
//Unit better refinements, type might come back as a false positive on dual types
function MatchType(cleanText, dirtyText = '') {
    let defaultType = {
        data: CheckForBaseType(cleanText),
    };
    defaultType.length = defaultType.data.length;
    let creatureType = {
        data: CheckForCreatureType(cleanText),
    };
    creatureType.length = creatureType.data.length;
    let isCreatureCheck = isCreature(defaultType, creatureType);
    if(isCreatureCheck.length > 0) {
        return isCreatureCheck;
    } 

    if (defaultType.length !== 0 && defaultType.data[0][0] >= .15) {
        return [defaultType.data[0]];
    }
    return [];
}

function isCreature(defaultTypes, creatureTypes) {
    let percentage = 0;
    let isCreatureDefault = defaultTypes.data.some((item) => {
        if (item[0] >= .50 && item[1] === 'Creature') {
            percentage = item[0];
            return true;
        }
        return false;
    });
    if (isCreatureDefault) {
        return [
            [percentage, 'Creature']
        ];
    }
    let isCreature = creatureTypes.data.some((item) => {
        if (item[0] >= .50 && item[1] === 'Creature') {
            percentage = item[0];
            return true;
        }
        return false;
    });
    if (isCreature) {
        return [
            [percentage, 'Creature']
        ];
    }
    return [];
}

module.exports = {
    MatchType
}