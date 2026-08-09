#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gitMarker = path.join(repoRoot, ".git");
const executableName = process.platform === "win32" ? "lefthook.exe" : "lefthook";
const lefthook = path.join(repoRoot, "node_modules", ".bin", executableName);
const packagingCommands = new Set(["pack", "publish"]);

// Published packages have no repository hooks to install. A source checkout without dev
// dependencies should also remain packable; the next pnpm install will run this again once the
// lefthook binary exists.
if (
    packagingCommands.has(process.env.npm_command) ||
    !fs.existsSync(gitMarker) ||
    !fs.existsSync(lefthook)
) {
    process.exit(0);
}

const result = spawnSync(lefthook, ["install"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
});

if (result.error) {
    console.warn(`Skipping Git hook installation: ${result.error.message}`);
    process.exit(0);
}

if (result.status !== 0) {
    console.warn("Skipping Git hook installation because Lefthook could not update the hooks.");
}
