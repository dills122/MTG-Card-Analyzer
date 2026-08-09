import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assert } from "chai";

const CHILD_FIXTURE = path.resolve("test/fixtures/scan-lifecycle-child.mjs");

function runChild(mode, root, inputPath) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [CHILD_FIXTURE, mode, root, inputPath], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                MTG_CONFIG_PATH: path.join(root, "missing-config.json")
            },
            stdio: ["ignore", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    });
}

async function readNedbRecords(filename) {
    const contents = await readFile(filename, "utf8");
    return contents
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((record) => !record.$$deleted && !record.$$indexCreated);
}

describe("CLI scan lifecycle process boundary", () => {
    let root;
    let inputPath;

    beforeEach(async () => {
        root = await mkdtemp(path.join(os.tmpdir(), "mtg-scan-lifecycle-"));
        inputPath = path.join(root, "card.jpg");
        await writeFile(inputPath, "fixture input");
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it("persists hash and operations-log writes before a successful CLI exit", async () => {
        const result = await runChild("success", root, inputPath);

        assert.equal(result.signal, null);
        assert.equal(result.code, 0, result.stderr || result.stdout);
        const hashes = await readNedbRecords(path.join(root, "card-hashes.db"));
        const operations = await readNedbRecords(path.join(root, "operations.db"));
        assert.isTrue(
            hashes.some(
                (hash) =>
                    hash.cardName === "Pacifism" &&
                    hash.setName === "Core Set 2020" &&
                    hash.cardHash === "fixture-hash" &&
                    hash.hashMode === "full-card"
            )
        );
        assert.isTrue(
            operations.some(
                (operation) => operation.filePath === inputPath && operation.decision === "dry-run"
            )
        );
        assert.notInclude(await readdir(root), "scan-temp");
    });

    it("persists the primary error log and removes temp files before a failed CLI exit", async () => {
        const result = await runChild("failure", root, inputPath);

        assert.equal(result.signal, null);
        assert.equal(result.code, 1, result.stderr || result.stdout);
        const operations = await readNedbRecords(path.join(root, "operations.db"));
        assert.isTrue(
            operations.some(
                (operation) =>
                    operation.filePath === inputPath &&
                    operation.decision === "error" &&
                    operation.error === "fixture matching failure"
            )
        );
        assert.notInclude(await readdir(root), "scan-temp");
    });
});
