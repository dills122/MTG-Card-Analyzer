import { assert } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function freshLog() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-ops-log-test-"));
    process.env.CARD_NAMES_DB_PATH = tmpDir;
    const mod = await import(`../../src/db-local/ops-log.mjs?t=${Date.now()}-${Math.random()}`);
    return mod.default;
}

describe("db-local::ops-log", () => {
    const savedEnv = process.env.CARD_NAMES_DB_PATH;

    afterEach(() => {
        if (savedEnv === undefined) {
            delete process.env.CARD_NAMES_DB_PATH;
        } else {
            process.env.CARD_NAMES_DB_PATH = savedEnv;
        }
    });

    it("logOperation stores an entry retrievable via getOperations", async () => {
        const log = await freshLog();
        await log.logOperation({ filePath: "./a.jpg", decision: "collection" });
        const entries = await log.getOperations({});
        assert.lengthOf(entries, 1);
        assert.equal(entries[0].filePath, "./a.jpg");
        assert.instanceOf(entries[0].loggedAt, Date);
    });

    it("getOperations returns newest first and respects limit", async () => {
        const log = await freshLog();
        for (const filePath of ["./a.jpg", "./b.jpg", "./c.jpg"]) {
            await log.logOperation({ filePath, decision: "collection" });
        }
        const entries = await log.getOperations({ limit: 2 });
        assert.lengthOf(entries, 2);
        assert.equal(entries[0].filePath, "./c.jpg");
        assert.equal(entries[1].filePath, "./b.jpg");
    });

    it("getStats aggregates by decision, counts errors, and averages top confidence", async () => {
        const log = await freshLog();
        const entries = [
            { decision: "collection", nameMatches: [{ percentage: 0.9 }], error: null },
            { decision: "collection", nameMatches: [{ percentage: 0.8 }], error: null },
            { decision: "needs-attention", nameMatches: [{ percentage: 0.5 }], error: null },
            { decision: "error", nameMatches: [], error: "boom" }
        ];
        for (const entry of entries) {
            await log.logOperation(entry);
        }
        const stats = await log.getStats();
        assert.equal(stats.total, 4);
        assert.deepEqual(stats.byDecision, { collection: 2, "needs-attention": 1, error: 1 });
        assert.equal(stats.errorCount, 1);
        assert.closeTo(stats.avgTopConfidence, (0.9 + 0.8 + 0.5) / 3, 0.0001);
    });

    it("getStats on an empty log returns zeroed-out stats, not an error", async () => {
        const log = await freshLog();
        const stats = await log.getStats();
        assert.equal(stats.total, 0);
        assert.isNull(stats.avgTopConfidence);
    });
});
