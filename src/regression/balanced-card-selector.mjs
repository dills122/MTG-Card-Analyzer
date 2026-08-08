const COLOR_ORDER = ["W", "U", "B", "R", "G"];
const TYPE_ORDER = [
    "Land",
    "Creature",
    "Artifact",
    "Enchantment",
    "Planeswalker",
    "Instant",
    "Sorcery",
    "Battle"
];
const COVERAGE_WEIGHTS = {
    set: 8,
    colorCategory: 5,
    primaryType: 4,
    style: 3,
    rarity: 2,
    layout: 1
};
const DEPRIORITIZE_SCORE = 100;

function coverageStyle(card) {
    const frameEffects = Array.isArray(card.frame_effects) ? card.frame_effects : [];
    if (card.textless === true) return "textless";
    if (frameEffects.includes("showcase")) return "showcase";
    if (frameEffects.includes("extendedart")) return "extended-art";
    if (card.full_art === true) return "full-art";
    if (card.border_color === "borderless") return "borderless";
    return "normal";
}

function primaryType(typeLine) {
    return TYPE_ORDER.find((type) => typeLine.includes(type)) || "Other";
}

function colorCategory(colors, cardType) {
    if (cardType === "Land") return "land";
    if (colors.length === 0) return "colorless";
    if (colors.length > 1) return "multicolor";
    return colors[0];
}

function cardCoverage(card) {
    const colors = Array.isArray(card.colors)
        ? COLOR_ORDER.filter((color) => card.colors.includes(color))
        : [];
    const typeLine = typeof card.type_line === "string" ? card.type_line : "Unknown";
    const cardType = primaryType(typeLine);
    return {
        typeLine,
        colors,
        layout: typeof card.layout === "string" ? card.layout : "unknown",
        style: coverageStyle(card),
        primaryType: cardType,
        colorCategory: colorCategory(colors, cardType),
        isBasicLand: /\bBasic Land\b/.test(typeLine)
    };
}

function coverageScore(card, counts, selectedNames) {
    let score = 0;
    if (card.isBasicLand) score -= DEPRIORITIZE_SCORE;
    if (selectedNames.has(card.name)) score -= DEPRIORITIZE_SCORE;
    for (const [key, weight] of Object.entries(COVERAGE_WEIGHTS)) {
        score += weight / ((counts[key].get(card[key]) || 0) + 1);
    }
    return score;
}

function selectBalancedCards(cards, count) {
    const remaining = cards.map((card, index) => ({ card, index }));
    const selected = [];
    const counts = Object.fromEntries(
        Object.keys(COVERAGE_WEIGHTS).map((category) => [category, new Map()])
    );
    let hasBasicLand = false;
    const selectedNames = new Set();

    while (selected.length < count) {
        let best;
        for (const candidate of remaining) {
            if (candidate.card.isBasicLand && hasBasicLand) continue;
            const score = coverageScore(candidate.card, counts, selectedNames);
            if (
                !best ||
                score > best.score ||
                (score === best.score && candidate.index < best.index)
            ) {
                best = { ...candidate, score };
            }
        }
        if (!best) break;

        selected.push(best.card);
        hasBasicLand ||= best.card.isBasicLand;
        selectedNames.add(best.card.name);
        for (const key of Object.keys(COVERAGE_WEIGHTS)) {
            const categoryCounts = counts[key];
            const value = best.card[key];
            categoryCounts.set(value, (categoryCounts.get(value) || 0) + 1);
        }
        remaining.splice(
            remaining.findIndex((candidate) => candidate.index === best.index),
            1
        );
    }

    return selected;
}

export { cardCoverage, selectBalancedCards };
