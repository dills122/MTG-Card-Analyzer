module.exports = {
    base: 'https://api.scryfall.com',
    cardRandom: 'https://api.scryfall.com/cards/random',
    templates: {
        cardNameExact: 'https://api.scryfall.com/cards/named?exact=',
        cardNameFuzzy: 'https://api.scryfall.com/cards/named?fuzzy=',
        cardListExact: 'https://api.scryfall.com/cards/search?q=name%3A'
    }
};