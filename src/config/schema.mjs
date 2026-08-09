import joi from "joi";

const KNOWN_STORAGE_ADAPTERS = Object.freeze(["nedb", "rds"]);

const DEFAULTS = Object.freeze({
    storageAdapter: "nedb",
    queryingEnabled: false,
    prettyLogging: true,
    cardNamesDbPath: "",
    cardHashDbPath: "",
    configPath: "",
    localCacheEnabled: true,
    collectionEnabled: false,
    debugLogging: false
});

const SETTABLE_KEYS = Object.freeze({
    storageAdapter: Object.freeze({ type: "enum", values: KNOWN_STORAGE_ADAPTERS }),
    cardNamesDbPath: Object.freeze({ type: "string" }),
    cardHashDbPath: Object.freeze({ type: "string" }),
    localCacheEnabled: Object.freeze({ type: "boolean" }),
    collectionEnabled: Object.freeze({ type: "boolean" }),
    debugLogging: Object.freeze({ type: "boolean" }),
    queryingEnabled: Object.freeze({ type: "boolean" }),
    prettyLogging: Object.freeze({ type: "boolean" })
});

const USER_VALUE_SCHEMAS = {
    storageAdapter: joi.string().valid(...KNOWN_STORAGE_ADAPTERS),
    cardNamesDbPath: joi.string().allow(""),
    cardHashDbPath: joi.string().allow(""),
    localCacheEnabled: joi.boolean().strict(),
    collectionEnabled: joi.boolean().strict(),
    debugLogging: joi.boolean().strict(),
    queryingEnabled: joi.boolean().strict(),
    prettyLogging: joi.boolean().strict()
};

const userConfigSchema = joi.object(USER_VALUE_SCHEMAS).unknown(false);
const overrideSchema = joi
    .object({ ...USER_VALUE_SCHEMAS, configPath: joi.string().allow("") })
    .unknown(false);
const resolvedConfigSchema = joi
    .object({ ...USER_VALUE_SCHEMAS, configPath: joi.string().allow("") })
    .fork(Object.keys(DEFAULTS), (field) => field.required())
    .unknown(false);

/** @param {unknown} value */
function invalidAdapterError(value) {
    return new Error(
        `Invalid storageAdapter "${value}". Expected one of: ${KNOWN_STORAGE_ADAPTERS.join(", ")}`
    );
}

/**
 * @param {Record<string, unknown>} values
 * @param {joi.ObjectSchema} schema
 * @param {string} source
 */
function validateWithSchema(values, schema, source) {
    const storageAdapter = values.storageAdapter;
    if (
        Object.hasOwn(values, "storageAdapter") &&
        (typeof storageAdapter !== "string" || !KNOWN_STORAGE_ADAPTERS.includes(storageAdapter))
    ) {
        throw invalidAdapterError(storageAdapter);
    }
    const { error, value } = schema.validate(values, {
        abortEarly: false,
        convert: false
    });
    if (error) {
        throw new Error(
            `Invalid ${source}: ${error.details.map((detail) => detail.message).join("; ")}`
        );
    }
    return value;
}

/**
 * @param {Record<string, unknown>} values
 * @param {{source?: string, allowConfigPath?: boolean}} [options]
 */
function validateConfigLayer(values, { source = "configuration", allowConfigPath = false } = {}) {
    return validateWithSchema(values, allowConfigPath ? overrideSchema : userConfigSchema, source);
}

/** @param {Record<string, unknown>} values */
function validateResolvedConfig(values) {
    return validateWithSchema(values, resolvedConfigSchema, "resolved configuration");
}

export {
    DEFAULTS,
    KNOWN_STORAGE_ADAPTERS,
    SETTABLE_KEYS,
    validateConfigLayer,
    validateResolvedConfig
};

export default {
    DEFAULTS,
    KNOWN_STORAGE_ADAPTERS,
    SETTABLE_KEYS,
    validateConfigLayer,
    validateResolvedConfig
};
