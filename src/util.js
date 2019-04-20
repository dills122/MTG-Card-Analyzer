
function cleanString(string) {
    return string.replace(/[^A-Za-z0-9]/g, '');
}

module.exports = {
    cleanString
}