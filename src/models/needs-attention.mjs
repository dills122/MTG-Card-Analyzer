import _ from "lodash";
import Joi from "joi";
import storage from "../storage/index.mjs";

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

class NeedsAttention {
    constructor(params) {
        const validatedSchema = Joi.attempt(params, schema);
        _.assign(this, validatedSchema);
    }

    Insert() {
        const object = _.pick(this, Object.keys(schema.describe().keys));
        return storage.needsAttention.insert(object);
    }
}

const create = (params) => new NeedsAttention(params);

export { create, NeedsAttention };

export default {
    create,
    prototype: NeedsAttention.prototype
};
