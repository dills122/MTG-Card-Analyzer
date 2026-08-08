import txtUtil from "clean-text-utils";
import { createRequire } from "node:module";
import logger from "./logger/log.mjs";

const require = createRequire(import.meta.url);
const logInstance = logger.create({
    isPretty: true
});

function cleanString(string) {
    let cleanedString = txtUtil.strip.extraSpace(string);
    cleanedString = txtUtil.strip.newlines(cleanedString);
    cleanedString = txtUtil.strip.punctuation(cleanedString);
    return cleanedString;
}

function requireOrFalse(modulePath) {
    try {
        return require(modulePath);
        // eslint-disable-next-line no-unused-vars
    } catch (err) {
        logInstance.error(`requireOrFalse(): The file "${modulePath}".js could not be loaded.`);
        return false;
    }
}

// Small native replacements for the handful of lodash helpers used repeatedly across the
// codebase -- kept here once instead of pulling in lodash for a handful of one-line functions.

function round(value, precision = 0) {
    const factor = 10 ** precision;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value, lower, upper) {
    return Math.min(Math.max(value, lower), upper);
}

function mean(numbers = []) {
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function pick(object, keys = []) {
    return keys.reduce((result, key) => {
        if (object != null && Object.prototype.hasOwnProperty.call(object, key)) {
            result[key] = object[key];
        }
        return result;
    }, {});
}

function omit(object, keys = []) {
    const excluded = new Set(keys);
    return Object.fromEntries(Object.entries(object).filter(([key]) => !excluded.has(key)));
}

// Multi-key sort, e.g. orderBy(items, ["score", "name"], ["desc", "asc"]).
function orderBy(collection, keySelectors = [], directions = []) {
    const selectors = keySelectors.map((selector) =>
        typeof selector === "function" ? selector : (item) => item[selector]
    );
    return [...collection].sort((left, right) => {
        for (let index = 0; index < selectors.length; index += 1) {
            const direction = directions[index] === "desc" ? -1 : 1;
            const leftValue = selectors[index](left);
            const rightValue = selectors[index](right);
            if (leftValue < rightValue) return -direction;
            if (leftValue > rightValue) return direction;
        }
        return 0;
    });
}

export { cleanString, requireOrFalse, round, clamp, mean, pick, omit, orderBy };

export default {
    cleanString,
    requireOrFalse,
    round,
    clamp,
    mean,
    pick,
    omit,
    orderBy
};
