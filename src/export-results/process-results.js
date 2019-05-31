const _ = require('lodash');
const Search = require('../scryfall-api/index').Search;
const CardCollection = require('../models/card-collection');
const {
    Collection,
    CardHashes
} = require('../rds/index');
const {
    Hash
} = require('../image-hashing/index');
const {
    promisify
} = require('util');

const HashImage = promisify(Hash.HashImage);
const GetQty = promisify(Collection.GetQuantity);


function ProcessResults(params) {
    _.bindAll(this, Object.keys(ProcessResults.prototype));
    if (!params.name && !params.filePath) {
        return {
            error: 'malformed parameters'
        };
    }
    this.name = params.name;
    this.CheckDbHashes = promisify(this._compareDbHashes);
}

ProcessResults.prototype.execute = async function (filePath) {
    try {
        if (!this.name) {
            return {
                error: 'No name supplied'
            };
        }
        let cards = await Search.SearchList(this.name);
        if (cards.length === 0) {
            return {
                error: 'No results found'
            };
        }
        console.log('process-results::execute: Cards Found, Finding Best Match');
        if (cards.length === 1) {
            console.log(`process-results::execute: One Card Found ${JSON.stringify(cards)}`)
            await this._gatherResults(cards[0]);
            return {};
        }
        if (cards.length > 1) {
            let localImageHash = await HashImage(filePath);
            let dbResults = await this.CheckDbHashes(localImageHash);
            if (dbResults.value) {
                let card = _.find(cards, {
                    set_name: dbResults.value.setName
                });
                console.log(`process-results::execute::DBMatches One Card Found ${JSON.stringify(card)}`)
                await this._gatherResults(card);
                return {};
            }
            let result = await this._compareImageHashResults(cards, localImageHash);
            console.log(result);
            if (result.error) {
                return {
                    error: result.error
                };
            }
            if (result.value) {
                let card = _.find(cards, {
                    set_name: result.value.setName
                });
                console.log(`process-results::execute::BestMatches One Card Found ${JSON.stringify(card)}`)
                await this._gatherResults(card);
                return {};
            }
            if (result.sets) {
                console.log(`process-results::execute: More Than One Match Found ${JSON.stringify(result.sets)}`)
                return {
                    sets: result.sets
                };
            }
        }
        return {
            error: 'Couldn\'t find any cards'
        };
    } catch (error) {
        console.log(error);
    }
};
//Need to convert image hash comparison to use the art and flavor image areas for comparison
ProcessResults.prototype._compareImageHashResults = async function (results, localImageHash) {
    try {
        let imageUrls = _.map(results, function (card) {
            return {
                imgUrl: card.image_uris.normal || card.image_uris.large,
                setName: card.set_name
            }
        });

        let bestMatches = await this._getCardHashCompareResults(imageUrls, localImageHash);

        if (bestMatches.length > 1) {
            let exactMatches = _.filter(bestMatches, function (match) {
                return match.twoBitMatches >= 1 &&
                    match.fourBitMatches >= 1 &&
                    match.stringCompare >= 1;
            });
            if (exactMatches > 1) {
                console.log(`process-results::_compareImageHashResults: More Than One Exact Match Found ${JSON.stringify(exactMatches)}`)
                return {
                    sets: _.map(exactMatches, (match) => match.setName)
                }
            }
            if (exactMatches === 1) {
                console.log(`process-results::_compareImageHashResults: Exact Match Found ${JSON.stringify(exactMatches)}`);
                return {
                    value: exactMatches[0]
                }
            }
            console.log(`process-results::_compareImageHashResults: No Exact Match Found ${JSON.stringify(exactMatches)}`);
            return {
                sets: _.map(bestMatches, (match) => match.setName)
            };
        } else if (bestMatches.length === 1) {
            console.log(`process-results::_compareImageHashResults: One Best Match Found ${JSON.stringify(bestMatches)}`);
            return {
                value: bestMatches[0]
            };
        } else {
            let sets = _.map(imageUrls, obj => obj.setName);
            console.log(`process-results::_compareImageHashResults: No Exact or Best Match Found ${JSON.stringify(sets)}`);
            return {
                sets
            }
        }
    } catch (error) {
        console.log(error);
    }
};

ProcessResults.prototype._getCardHashCompareResults = async function (cards, localImageHash) {
    let comparisonResultsList = [];
    for (let i = 0; i < cards.length; i++) {
        let url = cards[i].imgUrl;
        let setName = cards[i].setName;
        let remoteImageHash = await HashImage(url);
        this._insertCardHash(remoteImageHash, setName);
        let comparisonResults = Hash.CompareHash(localImageHash, remoteImageHash);
        if (!_.isEmpty(comparisonResults)) {
            comparisonResultsList.push(Object.assign(comparisonResults, {
                setName
            }));
        }
    }

    let bestMatches = _.filter(comparisonResultsList, function (match) {
        return match.twoBitMatches >= .75 &&
            match.fourBitMatches >= .70 &&
            match.stringCompare >= .70;
    });
    return bestMatches;
}

ProcessResults.prototype._compareDbHashes = function (localHash, cb) {
    console.log(`process-results::_compareDbHashes: Compare DB Hashes`);
    CardHashes.GetHashes(this.name, (error, hashes) => {
        if (error) {
            return cb(error);
        }
        let matches = [];
        hashes.forEach((dbHash) => {
            let compareResults = Hash.CompareHash(localHash, dbHash.cardHash);
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
            console.log(`process-results::_compareDbHashes: No DB Hash Match Found ${this.name}`);
            return cb(null, {
                error: 'No Matches Found'
            })
        }
        if (matches.length > 1) {
            return cb(null, {
                sets: _.map(matches, result => result.setName)
            });
        }
        return cb(null, {
            value: matches[0]
        });
    });
};

ProcessResults.prototype._gatherResults = async function (object) {
    try {
        let quantity = await GetQty(object.name, object.set_name);
        let qty = quantity === 0 ? 1 : quantity;
        let model = CardCollection.create({});
        let isValid = model.initiate({
            cardName: object.name,
            cardType: object.type_line,
            cardSet: object.set_name,
            quantity: qty,
            estValue: _.round((object.prices.usd * qty), 4),
            automated: true,
            magicId: object.tcgplayer_id,
            imageUrl: object.image_uris.normal,
        });
        //TODO Add Update when QTY > 1
        if (isValid) {
            console.log(`process-results::_gatherResults: Inserting Card in Card_Catalog ${model.data}`);
            if (model.data.quantity > 1) {
                //Update
            } else {
                model.Insert();
            }
        }
    } catch (e) {
        console.log('Error');
        console.log(e);
    }
};

ProcessResults.prototype._insertCardHash = function (hash, setName) {
    CardHashes.InsertEntity({
        Name: this.name,
        SetName: setName,
        CardHash: hash
    });
};

module.exports = {
    create: function (params) {
        return new ProcessResults(params);
    }
}