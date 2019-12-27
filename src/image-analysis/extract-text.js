const {
    cleanString
} = require('../util');
const log = require('../logger/log');
const dependencies = {
    Tesseract: require('tesseract.js')
};

const logger = log.create({
    isPretty: true
});

function ScanImage(imgBuffer, cb) {
    logger.info(`extract-text::ScanImage:: Scanning Card ${Buffer.isBuffer(imgBuffer)? 'Image Buffer' : imgBuffer}`);
    dependencies.Tesseract.recognize(imgBuffer)
        .progress(message => {
            logger.info(JSON.stringify(message, null, 4))
        }).catch((err) => {
            logger.error(err);
            return cb(err, null, dependencies.Tesseract);
        })
        .then(() => {

        }).finally(resultOrError => {
            let cleanedString = cleanString(resultOrError.text);
            logger.info(`Extracted text: ${resultOrError.text}`);
            logger.info(`Extracted cleaned text: ${cleanedString}`);
            return cb(null, {
                cleanText: cleanedString,
                dirtyText: resultOrError.text
            }, dependencies.Tesseract);
        });
}

function ShutDown() {
    dependencies.Tesseract.terminate();
}

module.exports = {
    ScanImage,
    ShutDown,
    dependencies
}