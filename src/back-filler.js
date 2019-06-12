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
    let start = 2501;
    let stop = 3500;

    let names = await GetNames();
    let nameSlice = names.slice(start, stop);
    for (let i = 0; i < nameSlice.length; i++) {
        if(i % 10 === 0) {
            await sleep(2000);
        }
        let name = nameSlice[i].name;
        let cardImages = await GetImageUrls(name);
        for (let j = 0; j < cardImages.length; j++) {
            let card = cardImages[j];
            let urlNonQueryStr = card.imgUrl.split('?')[0] || '';
            let ext = urlNonQueryStr.split('.').pop() || '';
            if (ext === 'jpg') {
                try {
                    let imageHash = await HashImage(card.imgUrl);
                    CardHashes.InsertEntity({
                        CardName: name,
                        SetName: card.setName,
                        CardHash: imageHash,
                        IsPromo: card.isPromo,
                        IsFoil: card.isFoil
                    });
                } catch (error) {
                    console.log('Error');
                }
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
                setName: card.set_name,
                isFoil: card.foil,
                isPromo: card.promo
            }
        });
        return filteredCards;
    } catch (error) {
        console.log(error);
        return [];
    }
}

function sleep(ms){
    return new Promise(resolve=>{
        console.log("Sleeping");
        setTimeout(resolve,ms);
    })
}

(async () => {
    console.log('Back Fill Started');
    await BackFillImageHashes();
})();