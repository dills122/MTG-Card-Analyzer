import Joi from "joi";

// Need to finalize schema
export const schema = Joi.object().keys({
    transactionId: Joi.number(),
    name: Joi.string().min(3).max(50).optional(),
    artImage: Joi.string().min(3).optional(),
    flavorImage: Joi.string().min(3).optional(),
    flavorMatchPercent: Joi.number().min(0).required(),
    artMatchPercent: Joi.number().min(0).required()
});

export default {
    schema
};
