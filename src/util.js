const log = require('./logger/log');
const logger = log.create({
    isPretty: true
});

function cleanString(string) {
    return string.replace(/[^A-Za-z\s]/g, '');
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