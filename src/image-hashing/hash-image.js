const _ = require('lodash');
const {
    imageHash
} = require('image-hash');
const stringSimilarity = require('string-similarity');
const {
    ImageResults
} = require('../rds/index');

function HashImage(imgUrl, cb) {
    imageHash(imgUrl, 16, true, (error, data) => {
        if (error) {
            return cb(error);
        }
        return cb(null, data);
    });
}

function CompareHash(hashOne, hashTwo) {
    let HashLength = hashOne.length;
    let twoBitMatches = 0;
    let fourBitMatches = 0;
    hashOne.split('').forEach((c, index) => {
        if (index % 2 === 0) {
            let hashOneDoubleStr = hashOne.slice(index - 2, index);
            let hashTwoDoubleStr = hashTwo.slice(index - 2, index);
            twoBitMatches += hashOneDoubleStr === hashTwoDoubleStr ? 1 : 0;
        }
        if (index % 4 === 0) {
            let hashOneQuadStr = hashOne.slice(index - 4, index);
            let hashTwoQuadStr = hashTwo.slice(index - 4, index);
            fourBitMatches += hashOneQuadStr === hashTwoQuadStr ? 1 : 0;
        }
    });
    return {
        twoBitMatches: _.round(twoBitMatches / (HashLength / 2), 2),
        fourBitMatches: _.round(fourBitMatches / (HashLength / 4), 2),
        stringCompare: _.round(stringSimilarity.compareTwoStrings(hashOne, hashTwo), 2)
    };
}
//TODO Need to re-evaluate this method
function GetDBHashes(name, set, cb) {
    return ImageResults.GetHashes(name, set, cb);
}

function CompareDBHashes(name, set, localHashes, cb) {
    GetDBHashes(name, set, (err, hashes) => {
        if (err) {
            return cb(err);
        }
        if (!hashes) {
            return cb(null, {});
        }
        let isMatched = hashes.some((hashObj) => {
            let artHash = hashObj.artImageHash || '';
            let flavorHash = hashObj.flavorImageHash || '';
            let artHashComparison = CompareHash(artHash, localHashes.artHash);
            let flavorHashComparison = CompareHash(flavorHash, localHashes.flavorHash);
            return CompareDBHashResults(artHashComparison, hashObj.artMatchPercent) && CompareDBHashResults(flavorHashComparison, hashObj.flavorMatchPercent);
        });
        return cb(null, isMatched);
    });
}

function CompareDBHashResults(hashResults, dbAvgMatchPercent) {
    const differenceTolerance = 5;
    let {
        twoBitMatches,
        fourBitMatches,
        stringCompare
    } = hashResults;
    let hashAvgs = _.round((twoBitMatches + fourBitMatches + stringCompare) / 3, 2);
    let percentAvgDiff = _.round(getPercentageChange(hashAvgs, dbAvgMatchPercent));
    if (percentAvgDiff <= differenceTolerance) {
        return true;
    }
    return false;
}

function getPercentageChange(oldNumber, newNumber) {
    var decreaseValue = oldNumber - newNumber;

    return abs((decreaseValue / oldNumber) * 100);
}

module.exports = {
    HashImage,
    CompareHash,
    GetDBHashes,
    CompareDBHashes
};