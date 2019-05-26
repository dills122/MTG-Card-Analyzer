const Joi = require('@hapi/joi');

module.exports = {
    //Need to finialize schema
    schema: Joi.object().keys({
        cardId: Joi.number(),
        cardName: Joi.string().min(3).max(50).required(),
        cardType: Joi.string().min(3).max(25).required(),
        cardSet: Joi.string().min(3).max(20).required(),
        quantity: Joi.number().min(1).required(),
        estValue: Joi.number().optional(),
        automated: Joi.bool(),
        magicId: Joi.number().min(1).required(),
        imageUrl: Joi.string().min(3).max(150).required(),
    })
};