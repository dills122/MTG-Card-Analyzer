const Joi = require('joi');

module.exports = {
    //Need to finialize schema
    schema: Joi.object().keys({
        id: Joi.number().required().min(1),
        name: Joi.string().min(3).max(50).required(),
        type: Joi.string().min(3).max(25).required(),
        set: Joi.string().min(3).max(20).required(),
        automated: Joi.bool(),
    })
};