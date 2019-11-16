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
const logger = require('../logger/log');
const joi = require("@hapi/joi");

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

const schema = joi.object().keys({
    cards: joi.array().min(1).required(),
    localHash: joi.string().min(1).required(),
    name: joi.string().required(),
    queryingEnabled: joi.boolean().optional().default(false)
});

function ProcessHashes(params) {
    _.bindAll(this, Object.keys(ProcessHashes.prototype));
    let isValid = !joi.validate(params, schema).error;
    if(!isValid) {
        throw new Error("Required params missing");
    }
    _.assign(this, params);
    if(!this.logger) {
        this.logger = logger.create({
            isPretty: false
        });
    }
}

ProcessHashes.prototype.compareDbHashes = async function () {
    try {
        this.logger.info(`process-hashes::compareDbHashes: Compare DB Hashes`);
        let hashes = await GetHashes(this.name);
        let matches = [];
        hashes.forEach((dbHash) => {
            let compareResults = Hash.CompareHash(this.localHash, dbHash.cardHash);
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
            this.logger.info(`process-hashes::compareDbHashes: No DB Hash Match Found ${this.name}`);
            return {
                error: 'No Matches Found'
            };
        }
        return matches;
    } catch (error) {
        return {
            error
        };
    }
};

ProcessHashes.prototype.compareRemoteImages = async function () {
    try {
        this.logger.info(`process-hashes::compareDbHashes: Compare Remote Image Hashes`);
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
            let comparisonResults = Hash.CompareHash(this.localHash, remoteImageHash);
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
        this.logger.error(error);
        return {
            error
        };
    }
}

ProcessHashes.prototype._insertCardHash = function (hash, setName) {
    if (this.queryingEnabled) {
        CardHashes.InsertEntity({
            Name: this.name,
            SetName: setName,
            CardHash: hash
        });
    }
};

module.exports = {
    create: function (params) {
        return new ProcessHashes(params);
    }
}