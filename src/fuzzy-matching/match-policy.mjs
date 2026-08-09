import joi from "joi";

const MATCH_POLICY = Object.freeze({
    highConfidence: 0.95,
    minConfidence: 0.7,
    maxMatches: 5,
    supplementalEvidence: Object.freeze({
        minConfidence: 0.7,
        minScoreDelta: 0.05,
        minFirstTokenLength: 4,
        minFirstTokenSimilarity: 0.6,
        maxTokenLength: 32,
        maxTitleTokens: 32,
        maxSupplementalTokens: 160
    }),
    disambiguation: Object.freeze({
        minTopPercent: 0.8,
        minTopFirstTokenSimilarity: 0.6,
        maxScoreDelta: 0.12,
        minFirstTokenSimilarity: 0.4,
        maxFirstTokenDropFromTop: 0.15
    })
});

const percentage = joi.number().min(0).max(1).required();
const policySchema = joi
    .object({
        highConfidence: percentage,
        minConfidence: percentage,
        maxMatches: joi.number().integer().min(1).max(20).required(),
        supplementalEvidence: joi
            .object({
                minConfidence: percentage,
                minScoreDelta: percentage,
                minFirstTokenLength: joi.number().integer().min(1).required(),
                minFirstTokenSimilarity: percentage,
                maxTokenLength: joi.number().integer().min(1).required(),
                maxTitleTokens: joi.number().integer().min(1).required(),
                maxSupplementalTokens: joi.number().integer().min(1).required()
            })
            .required(),
        disambiguation: joi
            .object({
                minTopPercent: percentage,
                minTopFirstTokenSimilarity: percentage,
                maxScoreDelta: percentage,
                minFirstTokenSimilarity: percentage,
                maxFirstTokenDropFromTop: percentage
            })
            .required()
    })
    .unknown(false);

function resolveMatchPolicy(overrides = {}) {
    return joi.attempt(
        {
            ...MATCH_POLICY,
            ...overrides,
            supplementalEvidence: {
                ...MATCH_POLICY.supplementalEvidence,
                ...(overrides.supplementalEvidence || {})
            },
            disambiguation: {
                ...MATCH_POLICY.disambiguation,
                ...(overrides.disambiguation || {})
            }
        },
        policySchema
    );
}

export { MATCH_POLICY, resolveMatchPolicy };

export default { MATCH_POLICY, resolveMatchPolicy };
