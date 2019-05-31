const {
    cleanString
} = require('../util');

const dependencies = {
    Tesseract: require('tesseract.js')
};

function ScanImage(imgBuffer, cb) {
    console.log(`extract-text::ScanImage:: Scanning Card ${Buffer.isBuffer(imgBuffer)? 'Image Buffer' : imgBuffer}`);
    dependencies.Tesseract.recognize(imgBuffer)
        .progress(message => {
            console.log(JSON.stringify(message, null, 4))
        }).catch((err) => {
            console.log(err);
            return cb(err, null, dependencies.Tesseract);
        })
        .then(() => {

        }).finally(resultOrError => {
            let cleanedString = cleanString(resultOrError.text);
            console.log(`Extracted text: ${resultOrError.text}`);
            console.log(`Extracted cleaned text: ${cleanedString}`);
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