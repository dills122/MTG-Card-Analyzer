import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    DEFAULT_OCR_MODEL_FAMILY,
    DEFAULT_OCR_MODEL_PATH,
    DEFAULT_OCR_MODEL_SHA256
} from "../image-analysis/ocr-model.mjs";
import { analyzeNameRecords } from "../fuzzy-matching/name-index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");
const unsupportedOcrParameters = ["enable_new_segsearch", "save_raw_choices"];
const MIN_USABLE_CARD_NAMES = 1000;

function findUnsupportedOcrParameters(model) {
    return unsupportedOcrParameters.filter((parameter) => model.includes(Buffer.from(parameter)));
}

function inspectDefaultOcrModel(model) {
    const sha256 = createHash("sha256").update(model).digest("hex");
    return {
        sha256,
        expectedSha256: DEFAULT_OCR_MODEL_SHA256,
        matchesExpectedSha256: sha256 === DEFAULT_OCR_MODEL_SHA256,
        unsupportedParameters: findUnsupportedOcrParameters(model)
    };
}

function checkDefaultOcrModel() {
    if (!fs.existsSync(DEFAULT_OCR_MODEL_PATH)) {
        return {
            label: "English OCR model missing at repo root -- restore eng.traineddata.",
            status: "fail"
        };
    }

    const inspection = inspectDefaultOcrModel(fs.readFileSync(DEFAULT_OCR_MODEL_PATH));
    if (inspection.unsupportedParameters.length > 0) {
        return {
            label: `English OCR model contains unsupported parameters: ${inspection.unsupportedParameters.join(", ")}`,
            status: "fail"
        };
    }
    if (!inspection.matchesExpectedSha256) {
        return {
            label: "English OCR model does not match the pinned production SHA-256",
            status: "fail"
        };
    }
    return {
        label: `English OCR model available (official ${DEFAULT_OCR_MODEL_FAMILY} LSTM)`,
        status: "pass"
    };
}

function evaluateCardNameIndex(records) {
    const health = analyzeNameRecords(records);
    const counts = `${health.uniqueNames} unique matchable names, ${health.invalidRows} invalid rows, ${health.duplicateRows} duplicate rows`;
    if (health.uniqueNames < MIN_USABLE_CARD_NAMES) {
        return {
            health,
            label: `card names DB is unusable (${counts}; expected at least ${MIN_USABLE_CARD_NAMES}) -- run \`node ./src/db-local/bulk-insert.mjs\` to repair it`,
            status: "fail",
            required: true
        };
    }
    if (health.invalidRows > 0 || health.duplicateRows > 0) {
        return {
            health,
            label: `card names DB needs repair (${counts}) -- rerun \`node ./src/db-local/bulk-insert.mjs\``,
            status: "fail",
            required: false
        };
    }
    return {
        health,
        label: `card names DB healthy (${health.uniqueNames} unique matchable names)`,
        status: "pass",
        required: true
    };
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
    let cardNameIndex;

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

    const ocrModelCheck = checkDefaultOcrModel();
    record(ocrModelCheck.label, ocrModelCheck.status);

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
        const nameRecords = (await namesDb.find({})) || [];
        const indexCheck = evaluateCardNameIndex(nameRecords);
        cardNameIndex = indexCheck.health;
        record(indexCheck.label, indexCheck.status, indexCheck.required);
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
                const connection = await createConnection();
                await connection.end();
                record("MySQL connection succeeded", "pass");
            } catch (err) {
                record(`MySQL connection failed: ${err.message}`, "fail", false);
            }
        }
    }

    return { checks, requiredFailures, warnings, cardNameIndex };
}

export {
    MIN_USABLE_CARD_NAMES,
    evaluateCardNameIndex,
    findUnsupportedOcrParameters,
    inspectDefaultOcrModel,
    runEnvironmentCheck
};

export default { runEnvironmentCheck };
