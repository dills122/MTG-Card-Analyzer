#!/usr/bin/env node
// Sanity-checks the local dev environment: is everything actually usable, not just present.
// Run after scripts/setup.mjs, or any time something feels broken. Exits 1 if a required
// check fails; optional checks (MySQL, seeded names) only warn.
//
// Thin CLI wrapper around src/diagnostics/env-check.mjs, which also backs
// `node index.mjs diagnostics`. Usage: node scripts/verify-env.mjs [--with-mysql]

import { runEnvironmentCheck } from "../src/diagnostics/env-check.mjs";

const withMysql = process.argv.includes("--with-mysql");

console.log("Verifying MTG Card Analyzer dev environment...\n");

const { checks, requiredFailures, warnings } = await runEnvironmentCheck({ withMysql });

for (const { label, status } of checks) {
    const isWarning = status === "fail" && warnings.includes(label);
    const icon = status === "pass" ? "✓" : isWarning ? "⚠" : "✗";
    console.log(`  ${icon} ${label}`);
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
