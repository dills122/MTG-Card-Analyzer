import { cleanString } from "../util.mjs";

function normalizeForMatch(text) {
    return cleanString(String(text || ""))
        .toUpperCase()
        .trim();
}

function nameAliases(name) {
    return [...new Set([name, ...String(name || "").split(/\s+\/\/\s+/g)])].filter(Boolean);
}

function assertNameRecordsArray(names) {
    if (!Array.isArray(names)) {
        throw new Error("Stored card names must be an array");
    }
}

function analyzeNameRecords(names) {
    assertNameRecordsArray(names);
    const countsByNormalized = new Map();
    let invalidRows = 0;

    for (const record of names) {
        const normalized = typeof record?.name === "string" ? normalizeForMatch(record.name) : "";
        if (!normalized) {
            invalidRows += 1;
            continue;
        }
        countsByNormalized.set(normalized, (countsByNormalized.get(normalized) || 0) + 1);
    }

    const duplicateRows = [...countsByNormalized.values()].reduce(
        (total, count) => total + Math.max(0, count - 1),
        0
    );
    return {
        totalRows: names.length,
        validRows: names.length - invalidRows,
        uniqueNames: countsByNormalized.size,
        invalidRows,
        duplicateRows
    };
}

function buildNameIndex(names) {
    assertNameRecordsArray(names);
    const validRecords = names.filter(
        (record) => typeof record?.name === "string" && normalizeForMatch(record.name)
    );
    const canonicalNameByNormalized = new Map();
    const canonicalNames = new Set();
    for (const record of validRecords) {
        const normalized = normalizeForMatch(record.name);
        canonicalNames.add(normalized);
        if (!canonicalNameByNormalized.has(normalized)) {
            canonicalNameByNormalized.set(normalized, record.name);
        }
    }

    const aliasOwners = new Map();
    for (const record of validRecords) {
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

export { analyzeNameRecords, buildNameIndex, normalizeForMatch, uniqueNormalized };

export default { analyzeNameRecords, buildNameIndex, normalizeForMatch, uniqueNormalized };
