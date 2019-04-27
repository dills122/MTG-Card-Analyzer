const schema = require('./schemas/needs-attention-set.schema').schema;
const Joi = require('joi');

function CreateModel(params) {
    const model = {
        name: params.name,
        type: params.type,
        sets: params.sets.join()
    };
    let isValid = Joi.validate(model, schema).error;
    if(isValid) {
        return model;
    }
    return {};
}

module.exports = {
    CreateModel
}