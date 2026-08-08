import path from "node:path";
import { fileURLToPath } from "node:url";

// The trained network preserves the reviewed OCR corpus. Its two obsolete configuration entries
// are commented in place so modern Tesseract cores do not emit unsupported-parameter warnings.
const DEFAULT_OCR_LANGUAGE_PATH = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
);
const DEFAULT_OCR_MODEL_PATH = path.join(DEFAULT_OCR_LANGUAGE_PATH, "eng.traineddata");

export { DEFAULT_OCR_LANGUAGE_PATH, DEFAULT_OCR_MODEL_PATH };

export default {
    DEFAULT_OCR_LANGUAGE_PATH,
    DEFAULT_OCR_MODEL_PATH
};
