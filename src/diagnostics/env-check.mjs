import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DEFAULT_OCR_MODEL_PATH } from "../image-analysis/ocr-model.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");
const unsupportedOcrParameters = ["enable_new_segsearch", "save_raw_choices"];

function findUnsupportedOcrParameters(model) {
    return unsupportedOcrParameters.filter((parameter) => model.includes(Buffer.from(parameter)));
}

// Sanity-checks the environment is actually usable, not just "file exists". Shared by
// scripts/verify-env.mjs (dev setup) and `node index.mjs diagnostics` (support bundle) --
// one source of truth for what "is this environment healthy" means, printed differently by
// each caller.
//
// Returns { checks: [{ label, status: "pass"|"fail"|"warn" }], requiredFailures, warnings }
// rather than printing anything itself.
async function runEnvironmentCheck({ withMysql = false } = {}) {
    const checks = [];
    let requiredFailures = 0;
    const warnings = [];

    function record(label, status, required = true) {
        checks.push({ label, status });
        if (status === "fail") {
            if (required) {
                requiredFailures += 1;
            } else {
                warnings.push(label);
            }
        }
    }

    const nodeMajor = Number(process.versions.node.split(".")[0]);
    if (nodeMajor >= 20) {
        record(`Node ${process.versions.node}`, "pass");
    } else {
        record(`Node ${process.versions.node} -- this project targets Node >=20`, "fail");
    }

    if (fs.existsSync(DEFAULT_OCR_MODEL_PATH)) {
        const model = fs.readFileSync(DEFAULT_OCR_MODEL_PATH);
        const unsupportedParameters = findUnsupportedOcrParameters(model);
        if (unsupportedParameters.length === 0) {
            record("English OCR model available (patched eng.traineddata)", "pass");
        } else {
            record(
                `English OCR model contains unsupported parameters: ${unsupportedParameters.join(
                    ", "
                )}`,
                "fail"
            );
        }
    } else {
        record("English OCR model missing at repo root -- restore eng.traineddata.", "fail");
    }

    const testImage = path.join(repoRoot, "test-images/PlatinumAngel.jpg");
    if (fs.existsSync(testImage)) {
        record("test images present (test-images/)", "pass");
    } else {
        record(
            "test-images/ missing or incomplete -- can't verify with a real scan",
            "fail",
            false
        );
    }

    try {
        const { getConfig } = await import("../config/index.mjs");
        const config = getConfig();
        record(`storageAdapter (persistence tier): ${config.storageAdapter}`, "pass");
        record(`localCacheEnabled: ${config.localCacheEnabled}`, "pass");
        record(`collectionEnabled: ${config.collectionEnabled}`, "pass");
        record(`debugLogging: ${config.debugLogging}`, "pass");
        record(`queryingEnabled: ${config.queryingEnabled}`, "pass");
        record(`prettyLogging: ${config.prettyLogging}`, "pass");

        const { resolveDbFilename } = await import("../db-local/db.mjs");
        const namesDbPath = resolveDbFilename();
        const dir = path.dirname(namesDbPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
        record(`local cache dir is writable (${dir})`, "pass");

        const { db: namesDb } = await import("../db-local/db.mjs");
        const nameCount = await promisify(namesDb.count)({});
        if (nameCount > 0) {
            record(`card names DB seeded (${nameCount} names)`, "pass");
        } else {
            record(
                "card names DB is empty -- run `node ./src/db-local/bulk-insert.mjs` to seed it",
                "fail",
                false
            );
        }
    } catch (err) {
        record(`could not initialize local cache: ${err.message}`, "fail");
    }

    if (withMysql) {
        const secureConfigPath = path.join(repoRoot, "secure.config.cjs");
        if (!fs.existsSync(secureConfigPath)) {
            record(
                "secure.config.cjs not found -- copy secure.config.template.cjs and fill in credentials",
                "fail",
                false
            );
        } else {
            try {
                const { createConnection } = await import("../rds/connection.mjs");
                const connection = createConnection();
                await promisify(connection.connect.bind(connection))();
                connection.end();
                record("MySQL connection succeeded", "pass");
            } catch (err) {
                record(`MySQL connection failed: ${err.message}`, "fail", false);
            }
        }
    }

    return { checks, requiredFailures, warnings };
}

export { findUnsupportedOcrParameters, runEnvironmentCheck };

export default { runEnvironmentCheck };
