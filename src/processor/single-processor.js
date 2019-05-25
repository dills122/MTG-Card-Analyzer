const {
    textExtraction
} = require('../image-analysis/index');
const {
    resize
} = require('../image-processing/index');
const {
    MatchType,
    MatchName
} = require('../fuzzy-matching/index');
const {
    promisify,
} = require('util');

const Scan = promisify(textExtraction.ScanImage);

function ProcessCard(path) {
    ProcessNameImage(path).then((name) => {
        return MatchName.Match(name);
    }).then((nameMatches) => {
        console.log(nameMatches);
        return ProcessTypeImage(path);
    }).then((type) => {
        let typeMatches = MatchType(type);
        console.log(typeMatches);
        textExtraction.ShutDown();
    }).catch((err) => {
        console.log(err);
        textExtraction.ShutDown();
    });
}

async function ProcessNameImage(path) {
    try {
        let imgBuffer = await resize.GetImageSnippet(path, 'name');
        return await Scan(imgBuffer);
    } catch (err) {
        console.log(err);
    }
    return '';
}

async function ProcessTypeImage(path) {
    try {
        let imgBuffer = await resize.GetImageSnippet(path, 'type');
        return await Scan(imgBuffer);
    } catch (err) {
        console.log(err);
    }
    return '';
}

module.exports = {
    ProcessCard,
    ProcessNameImage,
    ProcessTypeImage
};