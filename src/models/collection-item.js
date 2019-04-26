const schema = require('./schemas/collection-item.schema').schema;
const Joi = require('joi');

function CreateModel(params) {
    const model = {
        name: params.name,
        type: params.type,
        set: params.set,
        automated: true
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