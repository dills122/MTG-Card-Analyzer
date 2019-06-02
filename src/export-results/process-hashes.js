const _ = require('lodash');
const {
    CardHashes
} = require('../rds/index');
const {
    Hash
} = require('../image-hashing/index');
const {
    promisify
} = require('util');

const HashImage = promisify(Hash.HashImage);
const GetHashes = promisify(CardHashes.GetHashes);

const config = {
    remoteMatch: {
        twoBit: .75,
        fourBit: .70,
        stringCompare: .75
    },
    dbMatch: {
        twoBit: .92,
        fourBit: .85,
        stringCompare: .92
    }
};

function ProcessHashes(params) {
    _.bindAll(this, Object.keys(ProcessHashes.prototype));
    if (!params.localCardPath && !params.cards && !params.name) {
        return {
            error: 'malformed parameters'
        };
    }
    this.localCardPath = params.localCardPath;
    this.cards = params.cards;
    this.name = params.name;
}

ProcessHashes.prototype.compareDbHashes = async function () {
    console.log(`process-hashes::compareDbHashes: Compare DB Hashes`);
    try {
        let localCardHash = await HashImage(this.localCardPath);
        let hashes = await GetHashes(this.name);
        let matches = [];
        hashes.forEach((dbHash) => {
            let compareResults = Hash.CompareHash(localCardHash, dbHash.cardHash);
            let isMatch = compareResults.twoBitMatches > .92 &&
                compareResults.fourBitMatches > .92 &&
                compareResults.stringCompare > .92;
            if (isMatch) {
                matches.push(Object.assign(compareResults, {
                    setName: dbHash.setName
                }));
            }
        });
        if (matches.length === 0) {
            console.log(`process-hashes::compareDbHashes: No DB Hash Match Found ${this.name}`);
            return {
                error: 'No Matches Found'
            };
        }
        if (matches.length > 1) {
            return {
                sets: _.map(matches, result => result.setName)
            };
        }
        return {
            value: matches[0]
        };
    } catch (error) {
        return {
            error
        };
    }
};

ProcessHashes.prototype.compareRemoteImages = async function () {
    try {
        let localCardHash = await HashImage(this.localCardPath);
        let cards = _.map(this.cards, function (card) {
            return {
                imgUrl: card.image_uris.normal || card.image_uris.large,
                setName: card.set_name
            }
        });
        let comparisonResultsList = [];
        for (let i = 0; i < cards.length; i++) {
            let url = cards[i].imgUrl;
            let setName = cards[i].setName;
            let remoteImageHash = await HashImage(url);
            this._insertCardHash(remoteImageHash, setName);
            let comparisonResults = Hash.CompareHash(localCardHash, remoteImageHash);
            if (!_.isEmpty(comparisonResults)) {
                comparisonResultsList.push(Object.assign(comparisonResults, {
                    setName
                }));
            }
        }
        let matchValues = config.remoteMatch;
        let bestMatches = _.filter(comparisonResultsList, function (match) {
            return match.twoBitMatches >= matchValues.twoBit &&
                match.fourBitMatches >= matchValues.fourBit &&
                match.stringCompare >= matchValues.stringCompare;
        });
        return bestMatches;
    } catch (error) {
        console.log(error);
    }
}

ProcessHashes.prototype._insertCardHash = function (hash, setName) {
    CardHashes.InsertEntity({
        Name: this.name,
        SetName: setName,
        CardHash: hash
    });
};

module.exports = {
    create: function (params) {
        return new ProcessHashes(params);
    }
}