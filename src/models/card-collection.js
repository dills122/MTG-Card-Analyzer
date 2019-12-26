const _ = require('lodash');
const Joi = require('@hapi/joi');
const {
    Collection
} = require('../rds/index');

const schema = Joi.object().keys({
    cardId: Joi.number(),
    cardName: Joi.string().min(3).max(50).required(),
    cardType: Joi.string().min(3).max(50).required(),
    cardSet: Joi.string().min(3).max(50).required(),
    quantity: Joi.number().min(1).required(),
    estValue: Joi.number().optional(),
    automated: Joi.bool(),
    magicId: Joi.number().min(1).required(),
    imageUrl: Joi.string().min(3).max(150).required(),
});

class CardCollection {
    constructor(params) {
        let validatedSchema = Joi.attempt(params, schema);
        _.assign(this, validatedSchema);
    }

    Insert() {
        let object = _.pick(this, Object.keys(schema.describe().keys));
        Collection.InsertEntity(object);
    } 
}

module.exports = {
    create:function(params) {
        return new CardCollection(params);
    },
    prototype: CardCollection.prototype
};