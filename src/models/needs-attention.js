const _ = require('lodash');
const Joi = require('@hapi/joi');
const {
    Collection
} = require('../rds/index');

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
        let validatedSchema = Joi.attempt(params, schema);
        _.assign(this, validatedSchema);
    }

    Insert() {
        let object = _.pick(this, Object.keys(schema.describe().keys));
        Collection.InsertEntity(object);
    }
}

module.exports = {
    create: function (params) {
        return new NeedsAttention(params);
    }
};