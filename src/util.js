
function cleanString(string) {
    return string.replace(/[^A-Za-z\s]/g, '');
}

function requireF(modulePath){ // force require
    try {
     return require(modulePath);
    }
    catch (e) {
     console.log('requireF(): The file "' + modulePath + '".js could not be loaded.');
     return false;
    }
}

module.exports = {
    cleanString,
    requireF
}