const schema = require('./schemas/needs-attention.schema').schema;
const Joi = require('joi');

function CreateModel(params) {
    const model = {
        name: params.name,
        extractedText: params.extractedText || '',
        dirtyExtractedText: params.dirtyExtractedText || '',
        nameImage: params.nameImage,
        typeImage: params.typeImage
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