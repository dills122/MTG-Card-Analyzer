#!/usr/bin/env node
// Sanity-checks the local dev environment: is everything actually usable, not just present.
// Run after scripts/setup.mjs, or any time something feels broken. Exits 1 if a required
// check fails; optional checks (MySQL, seeded names) only warn.
//
// Usage: node scripts/verify-env.mjs [--with-mysql]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const withMysql = process.argv.includes("--with-mysql");

let requiredFailures = 0;
const warnings = [];

function pass(label) {
    console.log(`  ✓ ${label}`);
}
function fail(label, required = true) {
    console.log(`  ${required ? "✗" : "⚠"} ${label}`);
    if (required) {
        requiredFailures += 1;
    } else {
        warnings.push(label);
    }
}

console.log("Verifying MTG Card Analyzer dev environment...\n");

console.log("Runtime:");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 20) {
    pass(`Node ${process.versions.node}`);
} else {
    fail(`Node ${process.versions.node} -- this project targets Node >=20`);
}

console.log("\nRequired files:");
const traineddataPath = path.join(repoRoot, "eng.traineddata");
if (fs.existsSync(traineddataPath)) {
    pass("eng.traineddata present at repo root");
} else {
    fail("eng.traineddata missing at repo root -- OCR will fail. See README prerequisites.");
}

const testImage = path.join(repoRoot, "test-images/PlatinumAngel.jpg");
if (fs.existsSync(testImage)) {
    pass("test images present (test-images/)");
} else {
    fail("test-images/ missing or incomplete -- can't verify with a real scan", false);
}

console.log("\nLocal nedb cache (always-on tier):");
try {
    const { getConfig } = await import("../src/config/index.mjs");
    const config = getConfig();
    console.log(`  storageAdapter (persistence tier): ${config.storageAdapter}`);
    console.log(`  localCacheEnabled: ${config.localCacheEnabled}`);

    const { resolveDbFilename } = await import("../src/db-local/db.mjs");
    const namesDbPath = resolveDbFilename();
    const dir = path.dirname(namesDbPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    pass(`local cache dir is writable (${dir})`);

    const { db: namesDb } = await import("../src/db-local/db.mjs");
    const nameCount = await new Promise((resolve, reject) => {
        namesDb.count({}, (err, count) => (err ? reject(err) : resolve(count)));
    });
    if (nameCount > 0) {
        pass(`card names DB seeded (${nameCount} names)`);
    } else {
        fail(
            "card names DB is empty -- run `node ./src/db-local/bulk-insert.mjs` to seed it",
            false
        );
    }
} catch (err) {
    fail(`could not initialize local cache: ${err.message}`);
}

if (withMysql) {
    console.log("\nMySQL (persistence tier, --storage-adapter rds):");
    const secureConfigPath = path.join(repoRoot, "secure.config.cjs");
    if (!fs.existsSync(secureConfigPath)) {
        fail(
            "secure.config.cjs not found -- copy secure.config.template.cjs and fill in credentials",
            false
        );
    } else {
        try {
            const { CreateConnection } = await import("../src/rds/connection.mjs");
            const connection = CreateConnection();
            await new Promise((resolve, reject) => {
                connection.connect((err) => (err ? reject(err) : resolve()));
            });
            connection.end();
            pass("MySQL connection succeeded");
        } catch (err) {
            fail(`MySQL connection failed: ${err.message}`, false);
        }
    }
} else {
    console.log("\nMySQL: skipped (pass --with-mysql to check it)");
}

console.log("\n" + "-".repeat(50));
if (requiredFailures > 0) {
    console.log(`${requiredFailures} required check(s) failed.`);
    process.exit(1);
}
if (warnings.length > 0) {
    console.log(`All required checks passed. ${warnings.length} optional warning(s) above.`);
} else {
    console.log("All checks passed.");
}
process.exit(0);
