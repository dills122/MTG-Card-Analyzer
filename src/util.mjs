import txtUtil from "clean-text-utils";
import logger from "./logger/log.mjs";
import { createRequire } from "node:module";

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
    } catch (e) {
        logInstance.error(`requireF(): The file "${modulePath}".js could not be loaded.`);
        return false;
    }
}

export { cleanString, requireF };

export default {
    cleanString,
    requireF
};
