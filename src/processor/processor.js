const _ = require('lodash');
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
const {
    WriteToFile,
    WriteTmp,
    DeleteFiles,
    CreateDirectory
} = require('../file-io');
const {
    ProcessResults
} = require('../export-results/index');
const {
    Base64
} = require('../image-hashing/index');
const NeedsAttention = require('../models/needs-attention');

const dependencies = {
    MatchName
}

const Scan = promisify(textExtraction.ScanImage);

function SingleProcessor(params) {
    _.bindAll(this, Object.keys(SingleProcessor.prototype));
    this.filePath = params.filePath;
    this.imagePaths = {};
}

SingleProcessor.prototype.execute = function (callback) {
    this._processCard(this.filePath, (err) => {
        if (err) {
            return callback(err);
        }
        return callback(null);
    });
}

SingleProcessor.prototype.generateOutput = function (callback) {
    this._processOutputFile().then((filePath) => {
        return callback(null, filePath);
    }).catch((err) => {
        return callback(err);
    });
}

SingleProcessor.prototype._processCard = function (path, callback) {
    CreateDirectory().then((directory) => {
        if (directory) {
            this.directory = directory;
        }
        return this._processNameImage(path);
    }).then((names) => {
        this.name = names.cleanText;
        this.dirtyName = names.dirtyText;
        return dependencies.MatchName.Match(this.name);
    }).then((nameMatches) => {
        this.nameMatches = nameMatches;
        console.log(this.nameMatches);
        return this._processTypeImage(path);
    }).then((types) => {
        this.type = types.cleanText;
        this.dirtyType = types.dirtyText;
        this.typeMatches = MatchType(this.type);
        console.log(this.typeMatches);
        return this._processResults();
    }).then((cards) => {
        textExtraction.ShutDown();
        DeleteFiles(this.imagePaths);
        return callback(null);
    }).catch((err) => {
        console.log(err);
        textExtraction.ShutDown();
        return callback(err);
    });
}

SingleProcessor.prototype._processNameImage = async function (path) {
    try {
        let imgPath = await resize.GetImageSnippetTmpFile(path, this.directory, 'name');
        this.imagePaths.nameImage = imgPath;
        return await Scan(imgPath);
    } catch (err) {
        console.log(err);
    }
    return '';
}

SingleProcessor.prototype._processTypeImage = async function (path) {
    try {
        let imgPath = await resize.GetImageSnippetTmpFile(path,this.directory, 'type');
        this.imagePaths.typeImage = imgPath;
        return await Scan(imgPath);
    } catch (err) {
        console.log(err);
    }
    return '';
}

SingleProcessor.prototype._processResults = async function () {
    if (this.nameMatches && this.typeMatches) {

        let [namePercent, nameMatch] = this.nameMatches[0];
        // let [typePercent, typeMatch] = this.typeMatches[0];
        let resultsProcessor = ProcessResults.create({
            name: nameMatch,
            filePath: this.filePath
        });
        let results = await resultsProcessor.execute(this.filePath);
        console.log(results);
        if (results.error) {
            return results.error;
        }
        if (results.sets) {
            console.log('No Match Found Storing in Needs Atn');
            return this._processNeedsAtn(results.sets);
        }
    }
    return [];
}

SingleProcessor.prototype._processOutputFile = async function () {
    let [namePercent, nameMatch] = this.nameMatches[0];
    let [typePercent, typeMatch] = this.typeMatches[0];
    let obj = {
        "path": this.filePath,
        "created": new Date().toDateString(),
        "name-percentage": namePercent,
        "name-string": nameMatch,
        "type-percentage": typePercent,
        "type-string": typeMatch
    }
    return await WriteToFile(obj);
}

SingleProcessor.prototype._processNeedsAtn = function (sets) {
    // let base64Images = this._getBase64Images()
    let base64Images = {};
    let nameMatch = this.nameMatches[0] || [];
    let name = nameMatch[1] || '';
    let model = NeedsAttention.create({});
    let isValid = model.initiate({
        cardName: name,
        extractedText: this.name,
        dirtyExtractedText: this.dirtyName,
        nameImage: base64Images.nameImage || 'VGhpcyBpcyBhIGZha2Ugc3RyaW5nIQ==', //Filler Base64 till error is fixed
        typeImage: base64Images.typeImage || 'VGhpcyBpcyBhIGZha2Ugc3RyaW5nIQ==',
        artImage: base64Images.artImage || 'VGhpcyBpcyBhIGZha2Ugc3RyaW5nIQ==',
        flavorImage: base64Images.flavorImage || 'VGhpcyBpcyBhIGZha2Ugc3RyaW5nIQ==',
        possibleSets: sets.join(',')
    });
    if (isValid) {
        // model.Insert();
    } else {
        console.log('Error processing Needs Attention');
    }
};

SingleProcessor.prototype._getBase64Images = function () {
    let base64Results = Base64.StringfyImagesNDAtn({
        //Need figure way out to have tmp image for hashing
        flavorImage: this.imagePaths.flavorPath,
        artImage: this.imagePaths.artPath,
        typeImage: this.imagePaths.typePath,
        nameImage: this.imagePaths.namePath
    });
    return base64Results;
}

module.exports = {
    create: function (params) {
        return new SingleProcessor(params);
    },
    dependencies
}