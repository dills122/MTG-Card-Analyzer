import { cleanString } from "../util.mjs";

function normalizeForMatch(text) {
    return cleanString(String(text || ""))
        .toUpperCase()
        .trim();
}

function nameAliases(name) {
    return [...new Set([name, ...String(name || "").split(/\s+\/\/\s+/g)])].filter(Boolean);
}

function assertNameRecords(names) {
    if (!Array.isArray(names)) {
        throw new Error("Stored card names must be an array");
    }
    names.forEach((record, index) => {
        if (typeof record?.name !== "string" || !normalizeForMatch(record.name)) {
            throw new Error(`Stored card name at index ${index} must contain a non-empty name`);
        }
    });
}

function buildNameIndex(names) {
    assertNameRecords(names);
    const canonicalNameByNormalized = new Map();
    const canonicalNames = new Set();
    for (const record of names) {
        const normalized = normalizeForMatch(record.name);
        canonicalNames.add(normalized);
        canonicalNameByNormalized.set(normalized, record.name);
    }

    const aliasOwners = new Map();
    for (const record of names) {
        for (const alias of nameAliases(record.name).slice(1)) {
            const normalizedAlias = normalizeForMatch(alias);
            const owners = aliasOwners.get(normalizedAlias) || new Set();
            owners.add(record.name);
            aliasOwners.set(normalizedAlias, owners);
        }
    }
    for (const [normalizedAlias, owners] of aliasOwners) {
        if (owners.size !== 1 || canonicalNames.has(normalizedAlias)) {
            continue;
        }
        const [owner] = owners;
        canonicalNameByNormalized.set(normalizedAlias, owner);
    }

    return {
        canonicalNameByNormalized,
        matchableNames: [...canonicalNameByNormalized.keys()]
    };
}

function uniqueNormalized(values) {
    return [...new Set(values.map(normalizeForMatch).filter(Boolean))];
}

export { buildNameIndex, normalizeForMatch, uniqueNormalized };

export default { buildNameIndex, normalizeForMatch, uniqueNormalized };
