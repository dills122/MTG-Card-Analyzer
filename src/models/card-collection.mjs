import Joi from "joi";
import storage from "../storage/index.mjs";
import { pick } from "../util.mjs";

// "I scanned another copy" semantics: delta adds to whatever quantity already exists for
// this cardName+cardSet (default 1), it does not overwrite it. See src/storage/index.mjs
// for the persistence tier this routes through (STORAGE_ADAPTER-selected: nedb | rds).
const schema = Joi.object().keys({
    cardName: Joi.string().min(3).max(50).required(),
    cardType: Joi.string().min(3).max(50).required(),
    cardSet: Joi.string().min(3).max(50).required(),
    delta: Joi.number().min(1).optional().default(1),
    priceUsd: Joi.number().min(0).optional(),
    estValue: Joi.number().optional(),
    automated: Joi.bool(),
    magicId: Joi.number().min(1).required(),
    imageUrl: Joi.string().min(3).max(150).required()
});

const dependencies = {
    upsert: (record) => storage.collection.upsert(record)
};

function create(params) {
    const validated = Joi.attempt(params, schema);
    return {
        ...validated,
        insert() {
            const object = pick(this, Object.keys(schema.describe().keys));
            return dependencies.upsert(object);
        }
    };
}

export { create, dependencies };

export default { create, dependencies };
