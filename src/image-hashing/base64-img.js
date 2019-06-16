const base64Img = require('image-to-base64');
const log = require('../logger/log');
const dependencies = {
    base64Img
};

const logger = log.create({
    isPretty: true
});

async function StringfyImagesNDAtn(imagePaths) {
    try {
        let flavorImage = await dependencies.base64Img(imagePaths.flavorImage);
        let artImage = await dependencies.base64Img(imagePaths.artImage);
        let typeImage = await dependencies.base64Img(imagePaths.typeImage);
        let nameImage = await dependencies.base64Img(imagePaths.nameImage);
        let base64Images = {
            flavorImage,
            artImage,
            typeImage,
            nameImage
        };
        logger.info(`base64-img::StringfyImagesNDAtn : ${Object.keys(base64Images)}`);
        return base64Images;
    } catch (error) {
        logger.error(error);
        return error;
    }
}

module.exports = {
    StringfyImagesNDAtn,
    dependencies
}