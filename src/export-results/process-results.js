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
        if (cards.length === 1) {
            console.log('Only One Card Found');
            await this._gatherResults(cards[0]);
            return {};
        }
        //Issue with the hashing
        // if (cards.length > 1) {
        //     let result = await this._compareImageHashResults(cards, filePath);
        //     console.log('More than One set');
        //     if (result.error) {
        //         return {
        //             sets: result.sets
        //         };
        //     }
        //     if (result.value) {
        //         console.log('value found');
        //         console.log(result.value);
        //         await this._gatherResults(result.value);
        //         return {};
        //     }
        // }
        if(cards.length > 1) {
            return {
                sets: _.map(cards, obj => obj.set_name)
            };
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
            if (!_.isNull(comparisonResults)) {
                comparisonResultsList.push(Object.assign(comparisonResults, {
                    setName
                }));
            }
        }

        let bestMatches = _.filter(comparisonResultsList, function (val) {
            return val.twoBitMatches >= .75 &&
                val.fourBitMatches >= .70 &&
                val.stringCompare >= .70;
        });
        console.log(bestMatches);
        if (bestMatches.length > 1) {
            //TODO when more than one good match is found
            console.log('More than One Best Matches');
            return bestMatches[0];
        } else if (bestMatches.length === 1) {
            return {
                value: bestMatches[0]
            };
        } else {
            return {
                error: "No best results found",
                sets: _.map(imageUrls, obj => obj.setName)
            }
        }
    } catch (error) {
        console.log('Error Error read all about it');
        console.log(error);
    }
};

ProcessResults.prototype._gatherResults = async function (object) {
    try {
        let quantity = 1;
        console.log(`QTY *** ${quantity}`);
        let qty = quantity.length === 0 ? 1 : quantity[0];
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