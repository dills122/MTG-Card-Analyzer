import Joi from "joi";
import storage from "../storage/index.mjs";
import { pick } from "../util.mjs";

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

const dependencies = {
    insert: (record) => storage.needsAttention.insert(record)
};

function create(params) {
    const validated = Joi.attempt(params, schema);
    return {
        ...validated,
        insert() {
            const object = pick(this, Object.keys(schema.describe().keys));
            return dependencies.insert(object);
        }
    };
}

export { create, dependencies };

export default { create, dependencies };
