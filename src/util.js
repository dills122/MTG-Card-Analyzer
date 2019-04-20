
function cleanString(string) {
    return string.replace(/[^A-Za-z0-9\s]/g, '');
}

module.exports = {
    cleanString
}