const txtUtil = require("clean-text-utils");
const log = require('./logger/log');
const logger = log.create({
    isPretty: true
});

function cleanString(string) {
    let cleanedString = txtUtil.strip.extraSpace(string);
    cleanedString = txtUtil.strip.newlines(string);
    cleanedString = txtUtil.strip.punctuation(string);
    return cleanedString;
}

function requireF(modulePath) { // force require
    try {
        return require(modulePath);
    } catch (e) {
        logger.error('requireF(): The file "' + modulePath + '".js could not be loaded.');
        return false;
    }
}

module.exports = {
    cleanString,
    requireF
}