const _ = require('lodash');
const Search = require('../scryfall-api/index').Search;
const CardCollection = require('../models/card-collection');
const {
    Collection
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
            let result = await this._compareImageHashResults(cards, filePath);
            console.log(result);
            if (result.error) {
                return {
                    error: result.error
                };
            }
            if (result.value) {
                let card = _.find(cards, {set_name: result.value.setName});
                console.log(`process-results::execute::BestMatches One Card Found ${JSON.stringify(card)}`)
                await this._gatherResults(card);
                return {};
            }
            if(result.sets) {
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
        console.log('Here');
        console.log(error);
    }
};
//Need to convert image hash comparison to use the art and flavor image areas for comparison
ProcessResults.prototype._compareImageHashResults = async function (results, localImagePath) {
    try {
        let imageUrls = _.map(results, function (card) {
            return {
                imgUrl: card.image_uris.normal || card.image_uris.large,
                setName: card.set_name
            }
        });
        let comparisonResultsList = [];
        let localImageHash = await HashImage(localImagePath);
        for (let i = 0; i < imageUrls.length; i++) {
            let url = imageUrls[i].imgUrl;
            let setName = imageUrls[i].setName;
            let remoteImageHash = await HashImage(url);
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
        if (bestMatches.length > 1) {
            let exactMatches = _.filter(bestMatches, function (match) {
                return match.twoBitMatches >= 1 &&
                match.fourBitMatches >= 1 &&
                match.stringCompare >= 1;
            });
            if(exactMatches > 1) {
                console.log(`process-results::_compareImageHashResults: More Than One Exact Match Found ${JSON.stringify(exactMatches)}`)
                return {
                    sets: _.map(exactMatches, (match) => match.setName)
                }
            }
            if(exactMatches === 1) {
                console.log(`process-results::_compareImageHashResults: Exact Match Found ${JSON.stringify(exactMatches)}`);
                return {
                    value: exactMatches[0]
                }
            }
            console.log(`process-results::_compareImageHashResults: No Exact Match Found ${JSON.stringify(exactMatches)}`)
            return {
                sets: _.map(bestMatches, (match) => match.setName)
            };
        } else if (bestMatches.length === 1) {
            return {
                value: bestMatches[0]
            };
        } else {
            return {
                sets: _.map(imageUrls, obj => obj.setName)
            }
        }
    } catch (error) {
        console.log(error);
    }
};

ProcessResults.prototype._gatherResults = async function (object) {
    try {
        let quantity = await GetQty(object.name, object.set_name);
        console.log(`QTY *** ${quantity}`);
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
            console.log('Inserting record');
            model.Insert();
        }
    } catch (e) {
        console.log('Error');
        console.log(e);
    }
};

module.exports = {
    create: function (params) {
        return new ProcessResults(params);
    }
}