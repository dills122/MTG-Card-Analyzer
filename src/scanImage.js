const appPath = require('app-root-path');
const FuzzySet = require('fuzzyset.js');
const fs = require('fs');
const {
    promisify,
    inspect
} = require('util');
const Tesseract = require('tesseract.js');

const access = promisify(fs.access);
const writeFile = promisify(fs.writeFile);

async function ScanImage(imgPath) {
    let isAvailable = await access(imgPath, fs.F_OK);

    if (!isAvailable) {
        Tesseract.recognize(imgPath)
            .progress(message => console.log(message))
            .catch((err) => {
                console.log(err);
            })
            .then((result) => {

            }).finally(resultOrError => {
                console.log('Finished');
                let cleanedString = resultOrError.text.replace(/[^A-Za-z0-9]/g, '');
                let formattedResult = inspect(resultOrError, null, 4, true);
                let textResult = fuzzyMatch(cleanedString);
                console.log(resultOrError.text);
                console.log(cleanedString);
                console.log(textResult);
                WriteFile(`${appPath}/src/results.txt`, formattedResult);
                Tesseract.terminate();
            });
    }
}

function WriteFile(filePath, contents) {
    writeFile(filePath, contents).then((err) => {
        if (err) {
            console.log(err);
        }
    });
}

function fuzzyMatch(text) {
    let a = FuzzySet(['Meletis Charlatan', 'Mindstrab Thrull', 'Queen Marchesa', 'Platinum Angel', 'Adanto Vanguard']);
    return a.get(text);
}

module.exports = {
    ScanImage
}