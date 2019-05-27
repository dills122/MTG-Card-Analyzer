const base64Img = require('image-to-base64');


async function StringfyImagesNDAtn(imagePaths) {
    let flavorImage = await base64Img(imagePaths.flavorImage);
    let artImage = await base64Img(imagePaths.artImage);
    let typeImage = await base64Img(imagePaths.typeImage);
    let nameImage = await base64Img(imagePaths.nameImage);
    return {
        flavorImage,
        artImage,
        typeImage,
        nameImage
    };
}

module.exports = {
    StringfyImagesNDAtn
}