import util from "./util.mjs";
import resize from "./resize.mjs";
import ocrPreprocessor from "./ocr-preprocessing.mjs";
import imageProcessor from "./image-processor.mjs";

export const utilExports = util;
export const resizeExports = resize;
export const ocrPreprocessorExports = ocrPreprocessor;
export const ImageProcessor = imageProcessor;

export default {
    util,
    resize,
    ocrPreprocessor,
    ImageProcessor: imageProcessor
};
