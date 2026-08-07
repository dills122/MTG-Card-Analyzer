import _ from "lodash";
import Joi from "joi";
import rds from "../rds/index.mjs";
import log from "../logger/log.mjs";

const { NDAttn } = rds;
const logger = log.create({
    isPretty: true
});

const schema = Joi.object().keys({
    id: Joi.number(),
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

    Insert(callback) {
        const object = _.pick(this, Object.keys(schema.describe().keys));
        NDAttn.InsertRecord(object, (err, results) => {
            if (err) {
                logger.error(err);
            }
            if (typeof callback === "function") {
                callback(err, results);
            }
        });
    }
}

const create = (params) => new NeedsAttention(params);

export { create, NeedsAttention };

export default {
    create,
    prototype: NeedsAttention.prototype
};
