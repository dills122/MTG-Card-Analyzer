#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-card-analyzer-package-"));
const installDirectory = path.join(tempDirectory, "install");
const npmCacheDirectory = path.join(tempDirectory, "npm-cache");

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        encoding: "utf8",
        shell: process.platform === "win32",
        ...options
    });
    if (result.status !== 0) {
        throw new Error(
            [
                `${command} ${args.join(" ")} failed with exit code ${result.status}`,
                result.stdout,
                result.stderr
            ]
                .filter(Boolean)
                .join("\n")
        );
    }
    return result;
}

try {
    fs.mkdirSync(installDirectory);
    const packResult = run("npm", [
        "--cache",
        npmCacheDirectory,
        "pack",
        "--json",
        "--pack-destination",
        tempDirectory
    ]);
    const [metadata] = JSON.parse(packResult.stdout);
    const includedFiles = new Set(metadata.files.map(({ path: filePath }) => filePath));
    const requiredFiles = [
        "LICENSE",
        "Readme.md",
        "docs/cli-reference.md",
        "docs/configuration.md",
        "docs/image-fingerprint-benchmark.md",
        "eng.traineddata",
        "index.mjs",
        "mtg.config.example.json",
        "package.json",
        "secure.config.template.cjs"
    ];
    for (const requiredFile of requiredFiles) {
        assert(includedFiles.has(requiredFile), `packed artifact is missing ${requiredFile}`);
    }

    const excludedPrefixes = [
        ".codex/",
        ".github/",
        "coverage/",
        "scripts/",
        "test/",
        "test-images/",
        "training/"
    ];
    for (const filePath of includedFiles) {
        assert(
            !excludedPrefixes.some((prefix) => filePath.startsWith(prefix)),
            `packed artifact unexpectedly contains ${filePath}`
        );
    }
    assert(metadata.entryCount <= 90, `packed artifact has ${metadata.entryCount} files`);
    assert(
        metadata.unpackedSize <= 18 * 1024 * 1024,
        `packed artifact is unexpectedly large (${metadata.unpackedSize} bytes unpacked)`
    );

    const tarballPath = path.join(tempDirectory, metadata.filename);
    run(
        "npm",
        [
            "--cache",
            npmCacheDirectory,
            "install",
            "--no-audit",
            "--no-fund",
            "--no-package-lock",
            tarballPath
        ],
        { cwd: installDirectory }
    );

    const binName = process.platform === "win32" ? "mtg-card-analyzer.cmd" : "mtg-card-analyzer";
    const cliPath = path.join(installDirectory, "node_modules", ".bin", binName);
    assert(fs.existsSync(cliPath), "npm install did not create the mtg-card-analyzer bin");

    const versionResult = run(cliPath, ["--version"], { cwd: installDirectory });
    assert.equal(versionResult.stdout.trim(), packageJson.version);
    const helpResult = run(cliPath, ["--help"], { cwd: installDirectory });
    assert.match(helpResult.stdout, /Usage: mtg-card-analyzer/);
    assert.match(helpResult.stdout, /names/);
    assert.match(helpResult.stdout, /scan/);

    console.log(
        `Package smoke passed: ${metadata.filename}, ${metadata.entryCount} files, ${metadata.size} bytes packed, ${metadata.unpackedSize} bytes unpacked.`
    );
} finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
}
