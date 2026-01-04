import { CheckForBaseType, CheckForCreatureType } from "./type-mapping.mjs";

// Currently Creatures take precedence since they are a more common type
function MatchType(cleanText) {
    const defaultType = {
        data: CheckForBaseType(cleanText)
    };
    defaultType.length = defaultType.data.length;
    const creatureType = {
        data: CheckForCreatureType(cleanText)
    };
    creatureType.length = creatureType.data.length;
    const isCreatureCheck = isCreature(defaultType, creatureType);
    if (isCreatureCheck.length > 0) {
        return isCreatureCheck;
    }

    if (defaultType.length !== 0 && defaultType.data[0][0] >= 0.15) {
        return [defaultType.data[0]];
    }
    return [];
}

function isCreature(defaultTypes, creatureTypes) {
    let percentage = 0;
    const isCreatureDefault = defaultTypes.data.some((item) => {
        if (item[0] >= 0.5 && item[1] === "Creature") {
            percentage = item[0];
            return true;
        }
        return false;
    });
    if (isCreatureDefault) {
        return [[percentage, "Creature"]];
    }
    const isCreatureMatch = creatureTypes.data.some((item) => {
        if (item[0] >= 0.5 && item[1] === "Creature") {
            percentage = item[0];
            return true;
        }
        return false;
    });
    if (isCreatureMatch) {
        return [[percentage, "Creature"]];
    }
    return [];
}

export { MatchType };

export default {
    MatchType
};
