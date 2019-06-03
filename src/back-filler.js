const _ = require('lodash');
const {
    GetBulkNames
} = require('./db-local/index');
const {
    Search
} = require('./scryfall-api/index');
const {
    Hash
} = require('./image-hashing/index');
const {
    CardHashes
} = require('./rds/index');
const {
    promisify,
} = require('util');

let GetNames = promisify(GetBulkNames);
let HashImage = promisify(Hash.HashImage);

async function BackFillImageHashes() {
    let start = 100;
    let stop = 200;

    let names = await GetNames();
    let nameSlice = names.slice(start, stop);
    for (let i = 0; i < nameSlice.length; i++) {
        let name = nameSlice[i].name;
        let cardImages = await GetImageUrls(name);
        for (let j = 0; j < cardImages.length; j++) {
            let card = cardImages[j];
            let imageHash = await HashImage(card.imgUrl);
            try {
                CardHashes.InsertEntity({
                    Name: name,
                    SetName: card.setName,
                    CardHash: imageHash
                });
            } catch (error) {
                console.log('Error');
            }
        }
    }
}

async function GetImageUrls(name) {
    try {
        let cards = await Search.SearchList(name);
        let filteredCards = _.map(cards, function (card) {
            return {
                imgUrl: card.image_uris.normal || card.image_uris.large,
                setName: card.set_name
            }
        });
        return filteredCards;
    } catch (error) {
        console.log(error);
        return [];
    }
}

(async () => {
    console.log('Back Fill Started');
    await BackFillImageHashes();
})();