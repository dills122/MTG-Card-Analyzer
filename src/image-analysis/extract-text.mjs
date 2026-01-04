import { cleanString } from "../util.mjs";
import log from "../logger/log.mjs";
import Tesseract from "tesseract.js";

const logger = log.create({
    isPretty: true
});

function ScanImage(imgBuffer, cb) {
    logger.info(
        `extract-text::ScanImage:: Scanning Card ${Buffer.isBuffer(imgBuffer) ? "Image Buffer" : imgBuffer}`
    );
    Tesseract.recognize(imgBuffer, "eng", {
        logger: (message) => logger.info(JSON.stringify(message, null, 4))
    })
        .then((result) => {
            const extractedText = (result && result.data && result.data.text) || result.text || "";
            const cleanedString = cleanString(extractedText);
            logger.info(`Extracted text: ${extractedText}`);
            logger.info(`Extracted cleaned text: ${cleanedString}`);
            return cb(
                null,
                {
                    cleanText: cleanedString,
                    dirtyText: extractedText
                },
                Tesseract
            );
        })
        .catch((err) => {
            logger.error(err);
            return cb(err, null, Tesseract);
        });
}

function ShutDown() {
    Tesseract.terminate();
}

export const dependencies = { Tesseract };

export { ScanImage, ShutDown };

export default {
    ScanImage,
    ShutDown,
    dependencies
};
