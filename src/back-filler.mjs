import _ from "lodash";
import { promisify } from "node:util";
import dbLocal from "./db-local/index.mjs";
import scryfall from "./scryfall-api/index.mjs";
import imageHashing from "./image-hashing/index.mjs";

const { GetBulkNames } = dbLocal;
const { CardHashes } = dbLocal;
const { Search } = scryfall;
const { Hash } = imageHashing;

async function backFillCardHashes(cardName) {
    try {
        const searchResults = await Search.SearchByNameExact(cardName, cardName);
        let cardHashes = [];
        const cards = searchResults.data || [];
        for (const card of cards) {
            const imageUris = card.image_uris || {};
            const cardHash = await promisify(Hash.HashImage)(imageUris.normal);
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
            cardHashes.forEach((hash) => CardHashes.InsertEntity(hash));
        }
        return true;
    } catch (err) {
        console.log(err);
        return false;
    }
}

async function backFillMatchingCards() {
    const names = await promisify(GetBulkNames)();
    for (const { name } of names) {
        await backFillCardHashes(name);
    }
}

export { backFillCardHashes, backFillMatchingCards };

export default {
    backFillCardHashes,
    backFillMatchingCards
};
