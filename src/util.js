
function cleanString(string) {
    return string.replace(/[^A-Za-z\s]/g, '');
}

module.exports = {
    cleanString
}