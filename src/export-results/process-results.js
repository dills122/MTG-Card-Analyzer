const _ = require('lodash');
const Search = require('../scryfall-api/index').Search;
const CardCollection = require('../models/card-collection');
const NeedsAttention = require('../models/needs-attention');
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


function ProcessResults(params) {
    _.bindAll(this, Object.keys(ProcessResults.prototype));
    if (!params.name && !params.filePath) {
        return {
            error: 'malformed parameters'
        };
    }
    this.name = params.name;
}

ProcessResults.prototype.execute = async function () {
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
        return this._gatherResults(cards[0]);
    }

    _compareImageHashResults(cards, )
};
//Need to convert image hash comparison to use the art and flavor image areas for comparison
ProcessResults.prototype._compareImageHashResults = async function (results, localImagePath) {
    let imageUrls = _.map(results, function (card) {
        return card.image_uris.normal || card.image_uris.large;
    });
    let comparisonResultsList = [];
    for (let i = 0; i < imageUrls.length; i++) {
        let url = imageUrls[i];
        let remoteImageHash = await HashImage(url);
        let localImageHash = await HashImage(localImagePath);
        let comparisonResults = Hash.CompareHash(localImageHash, remoteImageHash);
        if (!_.isNull(comparisonResults)) {
            comparisonResultsList.push(comparisonResults);
        }
    }

    let bestMatches = _.filter(comparisonResultsList, function (val) {
        return val.twoBitMatches >= .75 &&
            val.fourBitMatches >= .70 &&
            val.stringCompare >= .70;
    });
    if (bestMatches.length > 1) {
        //TODO when more than one good match is found
    } else if (bestMatches.length === 1) {
        return bestMatches[0];
    } else {
        return {
            error: "No best results found"
        }
    }
};

ProcessResults.prototype._gatherResults = function (object) {
    try {

        Collection.GetQuantity(object.name, object.set, (err, quantity) => {
            if (err) {
                return err;
            }
            let qty = quantity.length === 0 ? 1 : quantity[0];
            let model = CardCollection.create({});
            let isValid = model.initiate({
                cardName: object.name,
                cardType: object.type_line,
                cardSet: object.set_name,
                quantity: qty,
                estValue: _.round((object.prices.usd * qty),2),
                automated: true,
                magicId: object.tcgplayer_id,
                imageUrl: object.image_uris.normal,
            });
            if (isValid) {
                console.log('Inserting record');
                model.Insert();
            }
        });
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