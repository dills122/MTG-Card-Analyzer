const Joi = require('joi');

module.exports = {
    //Need to finialize schema
    schema: Joi.object().keys({
        id: Joi.number(),
        name: Joi.string().min(3).max(50).optional(),
        sets: Joi.string().required().min(10),
        type: Joi.strict().required().min(3)
    })
};