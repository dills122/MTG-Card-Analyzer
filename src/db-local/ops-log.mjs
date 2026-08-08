import { getConfig } from "../config/index.mjs";
import { resolveDbFilename } from "./resolve-db-path.mjs";
import { createNedbStore } from "./create-nedb-store.mjs";

// Local operations log -- part of the always-on nedb cache tier (see src/storage/index.mjs).
// One entry per scan attempt: what was scanned, what matched, what happened, any error.
// This is what #49 ("Transaction") became -- the old model was a half-defined mix of
// generic-audit-log and art/flavor-match-confidence concepts that never got resolved.

// Monotonic tie-breaker: two logOperation calls can land in the same millisecond (nedb's
// Date sort doesn't reliably order same-millisecond entries), so `loggedAt` alone isn't a
// safe sort key. Resets on process restart, which is fine -- it only needs to disambiguate
// within a single run.
let sequenceCounter = 0;

const { insert, find, findSorted } = createNedbStore({
    resolveFilename: () => resolveDbFilename(getConfig().cardNamesDbPath, "operations.db")
});

// entry shape: { filePath, extractedText, nameMatches, matcherResults, decision,
//                queryingEnabled, storageAdapter, error, durationMs }
function logOperation(entry) {
    sequenceCounter += 1;
    const record = {
        ...entry,
        loggedAt: new Date(),
        seq: sequenceCounter
    };
    return insert(record);
}

async function getOperations(options = {}) {
    const { limit = 50, since } = options;
    const query = since ? { loggedAt: { $gte: new Date(since) } } : {};
    return findSorted(query, { sort: { seq: -1 }, limit });
}

async function getStats() {
    const docs = (await find({})) || [];
    const byDecision = {};
    let errorCount = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;

    docs.forEach((doc) => {
        const decision = doc.decision || "unknown";
        byDecision[decision] = (byDecision[decision] || 0) + 1;
        if (doc.error) {
            errorCount += 1;
        }
        (doc.nameMatches || []).forEach((match) => {
            if (typeof match.percentage === "number") {
                confidenceSum += match.percentage;
                confidenceCount += 1;
            }
        });
    });

    return {
        total: docs.length,
        byDecision,
        errorCount,
        avgTopConfidence: confidenceCount ? confidenceSum / confidenceCount : null
    };
}

export { logOperation, getOperations, getStats };

export default {
    logOperation,
    getOperations,
    getStats
};
