const {
    imageHash
} = require('image-hash');
const stringSimilarity = require('string-similarity');
const request = require('request-promise-native');

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
        hashTwo.split('').forEach((cTwo, indexTwo) => {
            if (index >= 2 && indexTwo >= 2) {
                let hashOneDoubleStr = hashOne.slice(c - 2, c);
                let hashTwoDoubleStr = hashTwo.slice(cTwo - 2, cTwo);
                twoBitMatches = hashOneDoubleStr === hashTwoDoubleStr ? twoBitMatches = +1 : twoBitMatches;
                if (index >= 4 && indexTwo >= 4) {
                    let hashOneQuadStr = hashOne.slice(c - 4, c);
                    let hashTwoQuadStr = hashTwo.slice(cTwo - 4, cTwo);
                    fourBitMatches = hashOneQuadStr === hashTwoQuadStr ? fourBitMatches = +1 : fourBitMatches;
                }
            }
        });
    });
    return {
        twoBitMatches: _.round(twoBitMatches / (HashLength / 2), 2),
        fourBitMatches: _.round(fourBitMatches / (HashLength / 4), 2),
        stringCompare: stringSimilarity.compareTwoStrings(hashOne,hashTwo)
    };
}

function GetDBHashes(name, set) {

}

module.exports = {
    HashImage,
    CompareHash,
    GetDBHashes
};