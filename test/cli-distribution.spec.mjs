import { assert } from "chai";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entrypoint = fileURLToPath(new URL("../index.mjs", import.meta.url));
const packageJson = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")
);

describe("CLI distribution contract", () => {
    it("installs the mtg-card-analyzer executable", () => {
        assert.deepEqual(packageJson.bin, { "mtg-card-analyzer": "./index.mjs" });
        assert.match(fs.readFileSync(entrypoint, "utf8"), /^#!\/usr\/bin\/env node\n/);
        if (process.platform !== "win32") {
            assert.notEqual(fs.statSync(entrypoint).mode & 0o111, 0);
        }
    });

    it("renders help with the installed command identity and runnable examples", () => {
        const result = spawnSync(process.execPath, [entrypoint, "--help"], {
            cwd: repoRoot,
            encoding: "utf8"
        });

        assert.equal(result.status, 0, result.stderr);
        assert.include(result.stdout, "Usage: mtg-card-analyzer [options] [command]");
        assert.include(result.stdout, "$ mtg-card-analyzer scan ./img-path --query");
        assert.notInclude(result.stdout, "Usage: program");
        assert.notMatch(result.stdout, /^ {2}\$ scan /m);
    });
});
