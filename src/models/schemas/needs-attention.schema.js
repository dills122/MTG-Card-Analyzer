const Joi = require('joi');

module.exports = {
    //Need to finialize schema
    schema: Joi.object().keys({
        id: Joi.number().required().min(1),
        name: Joi.string().min(3).max(50).optional(),
        extractedText: Joi.string().max(100).required(),
        dirtyExtractedText: Joi.string().max(100).required(),
        nameImage: Joi.string().min(1).required(),
        typeImage: Joi.string().min(3).optional()
    })
};