import path from "node:path";
import { fileURLToPath } from "node:url";

// Pinned official float LSTM model selected by the 125-case regression bakeoff.
// Source: https://github.com/tesseract-ocr/tessdata_best/blob/e12c65a915945e4c28e237a9b52bc4a8f39a0cec/eng.traineddata
const DEFAULT_OCR_MODEL_FAMILY = "tessdata_best";
const DEFAULT_OCR_MODEL_REVISION = "e12c65a915945e4c28e237a9b52bc4a8f39a0cec";
const DEFAULT_OCR_MODEL_SHA256 = "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba";
const DEFAULT_OCR_LANGUAGE_PATH = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
);
const DEFAULT_OCR_MODEL_PATH = path.join(DEFAULT_OCR_LANGUAGE_PATH, "eng.traineddata");

export {
    DEFAULT_OCR_LANGUAGE_PATH,
    DEFAULT_OCR_MODEL_FAMILY,
    DEFAULT_OCR_MODEL_PATH,
    DEFAULT_OCR_MODEL_REVISION,
    DEFAULT_OCR_MODEL_SHA256
};

export default {
    DEFAULT_OCR_LANGUAGE_PATH,
    DEFAULT_OCR_MODEL_FAMILY,
    DEFAULT_OCR_MODEL_PATH,
    DEFAULT_OCR_MODEL_REVISION,
    DEFAULT_OCR_MODEL_SHA256
};
