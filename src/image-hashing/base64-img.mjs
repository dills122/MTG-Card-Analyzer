import { readFile } from "node:fs/promises";
import log from "../logger/log.mjs";

// Native fs.readFile + Buffer in place of image-to-base64.
async function base64Img(imagePath) {
    const buffer = await readFile(imagePath);
    return buffer.toString("base64");
}

export const dependencies = {
    base64Img
};

const logger = log.create({
    isPretty: true
});

async function StringfyImagesNDAtn(imagePaths) {
    try {
        const flavorImage = await dependencies.base64Img(imagePaths.flavorImage);
        const artImage = await dependencies.base64Img(imagePaths.artImage);
        const typeImage = await dependencies.base64Img(imagePaths.typeImage);
        const nameImage = await dependencies.base64Img(imagePaths.nameImage);
        const base64Images = {
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

export { StringfyImagesNDAtn };

export default {
    StringfyImagesNDAtn,
    dependencies
};
