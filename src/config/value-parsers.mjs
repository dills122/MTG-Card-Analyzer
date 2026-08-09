/** @type {Readonly<Record<string, boolean>>} */
const BOOLEAN_TOKENS = Object.freeze({
    true: true,
    false: false,
    1: true,
    0: false
});

/**
 * @param {unknown} value
 * @param {{label?: string, allowNumeric?: boolean}} [options]
 * @returns {boolean | undefined}
 */
function parseBoolean(value, { label = "Boolean value", allowNumeric = true } = {}) {
    if (value === undefined) {
        return undefined;
    }
    const normalized = String(value).trim().toLowerCase();
    const allowedTokens = allowNumeric ? ["true", "false", "1", "0"] : ["true", "false"];
    if (!allowedTokens.includes(normalized)) {
        throw new Error(`${label} must be ${allowedTokens.join(" or ")}, got "${value}"`);
    }
    return BOOLEAN_TOKENS[normalized];
}

export { parseBoolean };

export default { parseBoolean };
