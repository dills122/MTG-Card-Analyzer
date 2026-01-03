const { cleanString } = require("../util");
const log = require("../logger/log");
const dependencies = {
    Tesseract: require("tesseract.js")
};

const logger = log.create({
    isPretty: true
});

function ScanImage(imgBuffer, cb) {
    logger.info(
        `extract-text::ScanImage:: Scanning Card ${Buffer.isBuffer(imgBuffer) ? "Image Buffer" : imgBuffer}`
    );
    dependencies.Tesseract.recognize(imgBuffer, "eng", {
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
                dependencies.Tesseract
            );
        })
        .catch((err) => {
            logger.error(err);
            return cb(err, null, dependencies.Tesseract);
        });
}

function ShutDown() {
    dependencies.Tesseract.terminate();
}

module.exports = {
    ScanImage,
    ShutDown,
    dependencies
};
