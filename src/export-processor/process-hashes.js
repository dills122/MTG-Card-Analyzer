const _ = require('lodash');
const async = require("async");
const logger = require('../logger/log');
const joi = require("joi");

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

const dependencies = {
    CardHashes: require("../rds").CardHashes,
    Hash: require("../image-hashing").Hash
};

const schema = joi.object().keys({
    cards: joi.array().min(1).required(),
    localHash: joi.string().min(1).required(),
    name: joi.string().required(),
    queryingEnabled: joi.boolean().optional().default(false)
});

class ProcessHashes {
    constructor(params = {}) {
        let validatedSchema = joi.attempt(params, schema);
        _.assign(this, validatedSchema);
        if (!this.logger) {
            this.logger = logger.create({
                isPretty: false
            });
        }
    }

    compareDbHashes(callback) {
        this.logger.info(`process-hashes::compareDbHashes: Compare DB Hashes`);
        dependencies.CardHashes.GetHashes(this.name, (err, hashes) => {
            if (err) {
                return callback(err);
            }
            let matches = [];
            hashes.forEach((dbHash) => {
                let compareResults = dependencies.Hash.CompareHash(this.localHash, dbHash.cardHash);
                let isMatch = compareResults.twoBitMatches >= .92 &&
                    compareResults.fourBitMatches >= .88 &&
                    compareResults.stringCompare >= .92;
                if (isMatch) {
                    matches.push(Object.assign(compareResults, {
                        setName: dbHash.setName
                    }));
                }
            });
            this.logger.info(matches);
            if (matches.length === 0) {
                this.logger.info(`process-hashes::compareDbHashes: No DB Hash Match Found ${this.name}`);
                return callback({
                    error: 'No Matches Found'
                });
            }
            return callback(null, matches);
        });
    }

    compareRemoteImages(callback) {
        this.logger.info(`process-hashes::compareDbHashes: Compare Remote Image Hashes`);
        let cards = _.map(this.cards, function (card) {
            let images = card.image_uris || {};
            return {
                imgUrl: images.normal || images.large,
                setName: card.set_name
            }
        });
        let comparisonResultsList = [];
        async.each(cards, (card, cb) => {
            let url = card.imgUrl;
            dependencies.Hash.HashImage(url, (err, remoteImageHash) => {
                if (err) {
                    return cb(err);
                }
                let setName = card.setName;
                this._insertCardHash(remoteImageHash, setName);
                let comparisonResults = dependencies.Hash.CompareHash(this.localHash, remoteImageHash);
                if (!_.isEmpty(comparisonResults)) {
                    comparisonResultsList.push(Object.assign(comparisonResults, {
                        setName
                    }));
                }
                return cb();
            });
        }, (err) => {
            if (err) {
                return callback(err);
            }
            let matchValues = config.remoteMatch;
            let bestMatches = _.filter(comparisonResultsList, function (match) {
                return match.twoBitMatches >= matchValues.twoBit &&
                    match.fourBitMatches >= matchValues.fourBit &&
                    match.stringCompare >= matchValues.stringCompare;
            });
            return callback(null, bestMatches);
        });
    }

    _insertCardHash() {
        if (this.queryingEnabled) {
            CardHashes.InsertEntity({
                Name: this.name,
                SetName: setName,
                CardHash: hash
            });
        }
    }
}

module.exports = {
    create: function (params) {
        return new ProcessHashes(params);
    },
    prototype: ProcessHashes.prototype
}