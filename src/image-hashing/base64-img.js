const base64Img = require('image-to-base64');

async function StringfyImagesNDAtn(imagePaths) {
    try {
        let flavorImage = await base64Img(imagePaths.flavorImage);
        let artImage = await base64Img(imagePaths.artImage);
        let typeImage = await base64Img(imagePaths.typeImage);
        let nameImage = await base64Img(imagePaths.nameImage);
        let base64Images = {
            flavorImage,
            artImage,
            typeImage,
            nameImage
        };
        console.log(`base64-img::StringfyImagesNDAtn : ${Object.keys(base64Images)}`);
        return base64Images;
    } catch (error) {
        console.log(error);
        return error;
    }
}

module.exports = {
    StringfyImagesNDAtn
}