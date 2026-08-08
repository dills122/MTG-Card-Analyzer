import util from "./util.mjs";
import smartCrop from "./smart-crop.mjs";
import ocrPreprocessor from "./ocr-preprocessing.mjs";
import imageProcessor from "./image-processor.mjs";

export { util, smartCrop, ocrPreprocessor };
export const ImageProcessor = imageProcessor;

export default {
    util,
    smartCrop,
    ocrPreprocessor,
    ImageProcessor: imageProcessor
};
