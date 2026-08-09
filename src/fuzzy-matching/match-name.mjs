import joi from "joi";
import logger from "../logger/log.mjs";
import { buildNameIndex, normalizeForMatch, uniqueNormalized } from "./name-index.mjs";
import { resolveMatchPolicy } from "./match-policy.mjs";
import { matchSupplementalEvidence } from "./supplemental-matcher.mjs";
import { matchTitleQueries } from "./title-matcher.mjs";

async function getStoredNames() {
    const { default: storage } = await import("../storage/index.mjs");
    return storage.names.getAll();
}

const defaultDependencies = Object.freeze({
    getNames: getStoredNames
});

const schema = joi.object({
    cleanText: joi.string().allow("").required(),
    candidateTexts: joi.array().items(joi.string().allow("")).max(48).optional(),
    supplementalText: joi.string().allow("").optional()
});

class MatchName {
    constructor(params = {}) {
        const {
            dependencies: injectedDependencies,
            logger: injectedLogger,
            policy: policyOverrides,
            ...input
        } = params;
        Object.assign(this, joi.attempt(input, schema));
        this.dependencies = {
            ...defaultDependencies,
            ...(injectedDependencies || {})
        };
        this.policy = resolveMatchPolicy(policyOverrides);
        this.logger = injectedLogger || logger.create({ isPretty: false });
    }

    async match() {
        const queries = uniqueNormalized([this.cleanText, ...(this.candidateTexts || [])]);
        const hasSupplementalEvidence = Boolean(normalizeForMatch(this.supplementalText));
        if (!queries.length && !hasSupplementalEvidence) {
            return [];
        }

        const names = await this.dependencies.getNames();
        const nameIndex = buildNameIndex(names);
        const titleResult = matchTitleQueries(queries, nameIndex, this.policy);
        this.matchedText = titleResult.matchedText;
        if (titleResult.matches.length || !hasSupplementalEvidence) {
            return titleResult.matches;
        }
        return matchSupplementalEvidence(
            this.cleanText,
            this.supplementalText,
            nameIndex,
            this.policy
        );
    }
}

const create = (params) => new MatchName(params);

export { create, MatchName };

export default { create, MatchName };
