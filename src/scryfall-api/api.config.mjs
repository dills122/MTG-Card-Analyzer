const base = "https://api.scryfall.com";

export default {
    base,
    templates: {
        cardNameExact: `${base}/cards/named?exact=`,
        cardNameFuzzy: `${base}/cards/named?fuzzy=`,
        cardListExact: `${base}/cards/search?q=name%3A`,
        catalogCardNames: `${base}/catalog/card-names`
    }
};
