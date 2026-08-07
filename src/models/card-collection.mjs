import _ from "lodash";
import Joi from "joi";
import rds from "../rds/index.mjs";
import log from "../logger/log.mjs";

const { Collection } = rds;
const logger = log.create({
    isPretty: true
});

const schema = Joi.object().keys({
    cardId: Joi.number(),
    cardName: Joi.string().min(3).max(50).required(),
    cardType: Joi.string().min(3).max(50).required(),
    cardSet: Joi.string().min(3).max(50).required(),
    quantity: Joi.number().min(1).required(),
    estValue: Joi.number().optional(),
    automated: Joi.bool(),
    magicId: Joi.number().min(1).required(),
    imageUrl: Joi.string().min(3).max(150).required()
});

class CardCollection {
    constructor(params) {
        const validatedSchema = Joi.attempt(params, schema);
        _.assign(this, validatedSchema);
    }

    Insert(callback) {
        const object = _.pick(this, Object.keys(schema.describe().keys));
        Collection.InsertRecord(object, (err, results) => {
            if (err) {
                logger.error(err);
            }
            if (typeof callback === "function") {
                callback(err, results);
            }
        });
    }
}

const create = (params) => new CardCollection(params);

export { create, CardCollection };

export default {
    create,
    prototype: CardCollection.prototype
};
