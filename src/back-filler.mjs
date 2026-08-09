import { promisify } from "node:util";
import storage from "./storage/index.mjs";
import scryfall from "./scryfall-api/index.mjs";
import imageHashing from "./image-hashing/index.mjs";
import log from "./logger/log.mjs";

const { names: NamesStore, hashes: HashesStore } = storage;
const { Search } = scryfall;
const { Hash } = imageHashing;
const logger = log.create({ isPretty: true });

// Promisified fresh at each call (not captured once at module load) so tests that
// sandbox.stub(imageHashing.Hash, "hashImage") keep working -- same dynamic-dispatch reasoning
// as src/storage/adapters/create-callback-adapter.mjs.
function hashImage(url) {
    return promisify(Hash.hashImage)(url);
}

async function backFillCardHashes(cardName) {
    try {
        // searchByNameExact returns a single card object (no printings list) -- searchList is
        // the one that returns every printing of the name (via /cards/search&unique=prints),
        // which is what hashing "every printing" actually needs. Using searchByNameExact here
        // silently no-opped forever: `.data` was always undefined on its response shape.
        const cards = await Search.searchList(cardName);
        let cardHashes = [];
        for (const card of cards) {
            const imageUris = card.image_uris || {};
            const cardHash = await hashImage(imageUris.normal);
            cardHashes.push({
                cardName: card.name,
                setName: card.set_name,
                isFoil: card.foil ? true : false,
                isPromo: card.promo ? true : false,
                cardHash,
                hashMode: "full-card"
            });
        }
        cardHashes = [...new Set(cardHashes)];
        if (cardHashes.length > 0) {
            cardHashes.forEach((hash) => HashesStore.upsert(hash));
        }
        logger.info(`Backfilled ${cardHashes.length} printing hash(es) for "${cardName}"`);
        return true;
    } catch (err) {
        logger.error(`Unable to backfill hashes for "${cardName}": ${err?.message || String(err)}`);
        return false;
    }
}

async function backFillMatchingCards() {
    const names = await NamesStore.getAll();
    logger.info(`Backfilling hashes for ${names.length} stored card name(s)`);
    let succeeded = 0;
    for (const { name } of names) {
        if (await backFillCardHashes(name)) {
            succeeded += 1;
        }
    }
    logger.info(`Backfill complete: ${succeeded}/${names.length} card name(s) succeeded`);
}

export { backFillCardHashes, backFillMatchingCards };

export default {
    backFillCardHashes,
    backFillMatchingCards
};
