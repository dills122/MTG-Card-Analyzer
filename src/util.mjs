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

function requireF(modulePath) {
    try {
        return require(modulePath);
        // eslint-disable-next-line no-unused-vars
    } catch (err) {
        logInstance.error(`requireF(): The file "${modulePath}".js could not be loaded.`);
        return false;
    }
}

export { cleanString, requireF };

export default {
    cleanString,
    requireF
};
