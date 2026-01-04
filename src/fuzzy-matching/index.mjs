import { MatchType } from "./match-type.mjs";
import MatchNameModule from "./match-name.mjs";
import typeMapping from "./type-mapping.mjs";

export const MatchName = MatchNameModule;
export const CheckForCreatureType = typeMapping.CheckForCreatureType;
export const MatchTypeExport = MatchType;

export default {
    MatchType: MatchTypeExport,
    MatchName,
    CheckForCreatureType
};
