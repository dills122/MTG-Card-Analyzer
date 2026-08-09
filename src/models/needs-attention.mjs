import Joi from "joi";
import storage from "../storage/index.mjs";
import { pick } from "../util.mjs";
import log from "../logger/log.mjs";

const logger = log.create({ isPretty: true });

const schema = Joi.object().keys({
    cardName: Joi.string().min(3).max(50).optional(),
    extractedText: Joi.string().max(100).required(),
    dirtyExtractedText: Joi.string().max(100).required(),
    nameImage: Joi.string().min(1).required(),
    typeImage: Joi.string().min(3).optional(),
    artImage: Joi.string().min(3).optional(),
    flavorImage: Joi.string().min(3).optional(),
    possibleSets: Joi.string().min(3).required()
});

const defaultDependencies = Object.freeze({
    insert: (record) => storage.needsAttention.insert(record)
});

function create(params) {
    const { dependencies: injectedDependencies, ...input } = params;
    const validated = Joi.attempt(input, schema);
    const dependencies = { ...defaultDependencies, ...(injectedDependencies || {}) };
    return {
        ...validated,
        async insert() {
            const object = pick(this, Object.keys(schema.describe().keys));
            try {
                return await dependencies.insert(object);
            } catch (err) {
                logger.error(
                    `Needs-attention write failed for "${object.cardName || "unknown"}": ${err?.message || String(err)}`
                );
                throw err;
            }
        }
    };
}

export { create };

export default { create };
