const {
    promisify
} = require('util');

var sizeOf = promisify(require('image-size'));

async function GetImageDimensions(imagePath) {
    return await sizeOf(imagePath);
}

module.exports = {
    GetImageDimensions
}