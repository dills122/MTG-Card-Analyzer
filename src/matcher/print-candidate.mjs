// @ts-check

/**
 * @typedef {object} PrintCandidate
 * @property {string} printId
 * @property {string} oracleId
 * @property {string} name
 * @property {string} printedName
 * @property {string} flavorName
 * @property {string} setCode
 * @property {string} setName
 * @property {string} collectorNumber
 * @property {string} language
 * @property {string} illustrationId
 * @property {string} layout
 * @property {string} frame
 * @property {string[]} frameEffects
 * @property {string} borderColor
 * @property {boolean} fullArt
 * @property {boolean} textless
 * @property {string[]} promoTypes
 * @property {string[]} availableFinishes
 * @property {string} imageUrl
 * @property {string} scryfallUri
 * @property {number | null} tcgplayerId
 * @property {string} typeLine
 * @property {number} priceUsd
 */

/** @param {unknown} value */
function stringValue(value) {
    return typeof value === "string" ? value.trim() : "";
}

/** @param {unknown} value */
function stringList(value) {
    return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

/** @param {any} card */
function firstFace(card = {}) {
    return Array.isArray(card.card_faces) ? card.card_faces.find(Boolean) || {} : {};
}

/** @param {any} card */
function imageUris(card = {}) {
    return card.image_uris || firstFace(card).image_uris || {};
}

/**
 * @param {any} card
 * @returns {PrintCandidate}
 */
function normalizePrintCandidate(card = {}) {
    const face = firstFace(card);
    const images = imageUris(card);
    return {
        printId: stringValue(card.id || card.printId),
        oracleId: stringValue(card.oracle_id || card.oracleId),
        name: stringValue(card.name),
        printedName: stringValue(card.printed_name || card.printedName || face.printed_name),
        flavorName: stringValue(card.flavor_name || card.flavorName),
        setCode: stringValue(card.set || card.setCode).toUpperCase(),
        setName: stringValue(card.set_name || card.setName),
        collectorNumber: stringValue(card.collector_number || card.collectorNumber),
        language: stringValue(card.lang || card.language || "en").toLowerCase(),
        illustrationId: stringValue(
            card.illustration_id || card.illustrationId || face.illustration_id
        ),
        layout: stringValue(card.layout),
        frame: stringValue(card.frame),
        frameEffects: stringList(card.frame_effects || card.frameEffects),
        borderColor: stringValue(card.border_color || card.borderColor),
        fullArt: Boolean(card.full_art ?? card.fullArt),
        textless: Boolean(card.textless),
        promoTypes: stringList(card.promo_types || card.promoTypes),
        availableFinishes: stringList(card.finishes || card.availableFinishes),
        imageUrl: stringValue(card.imageUrl || card.cardUrl || images.normal || images.large),
        scryfallUri: stringValue(card.scryfall_uri || card.scryfallUri || card.uri),
        tcgplayerId: Number(card.tcgplayer_id || card.tcgplayerId) || null,
        typeLine: stringValue(card.type_line || card.typeLine || face.type_line),
        priceUsd: Number(card.prices?.usd ?? card.priceUsd) || 0
    };
}

/** @param {any} printing */
function printIdentityKey(printing = {}) {
    const candidate = normalizePrintCandidate(printing);
    if (candidate.printId) {
        return `id:${candidate.printId}`;
    }
    if (candidate.setCode && candidate.collectorNumber) {
        return `print:${candidate.setCode}:${candidate.collectorNumber}:${candidate.language}`;
    }
    if (candidate.setName) {
        return `set:${candidate.setName}`;
    }
    return "unknown";
}

/** @param {any} printing */
function formatPrintLabel(printing = {}) {
    const candidate = normalizePrintCandidate(printing);
    const set = candidate.setCode || candidate.setName || "Unknown set";
    const number = candidate.collectorNumber ? ` #${candidate.collectorNumber}` : "";
    return `${set}${number}`;
}

export { formatPrintLabel, normalizePrintCandidate, printIdentityKey };

export default {
    formatPrintLabel,
    normalizePrintCandidate,
    printIdentityKey
};
