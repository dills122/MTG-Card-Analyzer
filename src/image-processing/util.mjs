import { promisify } from "node:util";
import imageSize from "image-size";

const sizeOf = promisify(imageSize);

async function GetImageDimensions(imagePath) {
    return sizeOf(imagePath);
}

export { GetImageDimensions };

export default {
    GetImageDimensions
};
