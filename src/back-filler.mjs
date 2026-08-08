import _ from "lodash";
import storage from "./storage/index.mjs";
import scryfall from "./scryfall-api/index.mjs";
import imageHashing from "./image-hashing/index.mjs";
import log from "./logger/log.mjs";

const { names: NamesStore, hashes: HashesStore } = storage;
const { Search } = scryfall;
const { Hash } = imageHashing;
const logger = log.create({ isPretty: true });

async function backFillCardHashes(cardName) {
    try {
        const searchResults = await Search.SearchByNameExact(cardName, cardName);
        let cardHashes = [];
        const cards = searchResults.data || [];
        for (const card of cards) {
            const imageUris = card.image_uris || {};
            const cardHash = await new Promise((resolve, reject) => {
                Hash.HashImage(imageUris.normal, (err, hash) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(hash);
                });
            });
            cardHashes.push({
                cardName: card.name,
                setName: card.set_name,
                isFoil: card.foil ? true : false,
                isPromo: card.promo ? true : false,
                cardHash
            });
        }
        cardHashes = _.uniq(cardHashes);
        if (cardHashes.length > 0) {
            cardHashes.forEach((hash) => HashesStore.upsert(hash));
        }
        return true;
    } catch (err) {
        logger.error(`Unable to backfill hashes for "${cardName}": ${err?.message || String(err)}`);
        return false;
    }
}

async function backFillMatchingCards() {
    const names = await NamesStore.getAll();
    for (const { name } of names) {
        await backFillCardHashes(name);
    }
}

export { backFillCardHashes, backFillMatchingCards };

export default {
    backFillCardHashes,
    backFillMatchingCards
};
