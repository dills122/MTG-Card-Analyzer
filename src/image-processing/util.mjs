import { promisify } from "node:util";
import imageSize from "image-size";

const sizeOf = promisify(imageSize);

async function getImageDimensions(imagePath) {
    return sizeOf(imagePath);
}

export { getImageDimensions };

export default {
    getImageDimensions
};
