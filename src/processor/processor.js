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
    WriteToFile
} = require('../file-io');
const {
    ProcessResults
} = require('../export-results/index');

const dependencies = {
    MatchName
}

const Scan = promisify(textExtraction.ScanImage);

function SingleProcessor(params) {
    _.bindAll(this, Object.keys(SingleProcessor.prototype));
    this.filePath = params.filePath;
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
    this._processNameImage(path).then((name) => {
        this.name = name;
        return dependencies.MatchName.Match(this.name);
    }).then((nameMatches) => {
        this.nameMatches = nameMatches;
        console.log(this.nameMatches);
        return this._processTypeImage(path);
    }).then((type) => {
        this.typeMatches = MatchType(type);
        console.log(this.typeMatches);
        return this._processResults();
    }).then((cards) => {
        textExtraction.ShutDown();
        return callback(null);
    }).catch((err) => {
        console.log(err);
        textExtraction.ShutDown();
        return callback(err);
    });
}

SingleProcessor.prototype._processNameImage = async function (path) {
    try {
        let imgBuffer = await resize.GetImageSnippet(path, 'name');
        return await Scan(imgBuffer);
    } catch (err) {
        console.log(err);
    }
    return '';
}

SingleProcessor.prototype._processTypeImage = async function (path) {
    try {
        let imgBuffer = await resize.GetImageSnippet(path, 'type');
        return await Scan(imgBuffer);
    } catch (err) {
        console.log(err);
    }
    return '';
}

SingleProcessor.prototype._processResults = async function () {
    if (this.nameMatches && this.typeMatches) {

        let [namePercent, nameMatch] = this.nameMatches[0];
        let [typePercent, typeMatch] = this.typeMatches[0];
        let resultsProcessor = ProcessResults.create({
            name: nameMatch
            //Need to add file path
        });
        resultsProcessor.execute();
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

module.exports = {
    create: function (params) {
        return new SingleProcessor(params);
    },
    dependencies
}