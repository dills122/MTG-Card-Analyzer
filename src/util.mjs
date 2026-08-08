import _ from "lodash";
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

// round/clamp are genuine one-liners over Math.round/min/max, worth keeping native. Multi-key
// sort, mean, pick, and omit are not -- reimplementing (and re-testing) lodash's versions of
// those isn't worth it, and @dills1220/nedb already pulls lodash in transitively, so using it
// here for the non-trivial pieces costs nothing extra in install size.
function round(value, precision = 0) {
    return Math.round((value + Number.EPSILON) * 10 ** precision) / 10 ** precision;
}

function clamp(value, lower, upper) {
    return Math.min(Math.max(value, lower), upper);
}

const mean = _.mean;
const pick = _.pick;
const omit = _.omit;
const orderBy = _.orderBy;
const once = _.once;

export { cleanString, requireOrFalse, round, clamp, mean, pick, omit, orderBy, once };

export default {
    cleanString,
    requireOrFalse,
    round,
    clamp,
    mean,
    pick,
    omit,
    orderBy,
    once
};
