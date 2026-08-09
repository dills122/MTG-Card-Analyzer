import { assert } from "chai";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("fresh-clone setup smoke", () => {
    let cloneRoot;

    beforeEach(() => {
        cloneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-fresh-setup-"));
        fs.mkdirSync(path.join(cloneRoot, "scripts"));
        fs.copyFileSync(
            path.join(repoRoot, "scripts/setup.mjs"),
            path.join(cloneRoot, "scripts/setup.mjs")
        );
        fs.copyFileSync(
            path.join(repoRoot, "scripts/install-git-hooks.mjs"),
            path.join(cloneRoot, "scripts/install-git-hooks.mjs")
        );
        fs.copyFileSync(
            path.join(repoRoot, "mtg.config.example.json"),
            path.join(cloneRoot, "mtg.config.example.json")
        );
        fs.copyFileSync(
            path.join(repoRoot, "secure.config.template.cjs"),
            path.join(cloneRoot, "secure.config.template.cjs")
        );
    });

    afterEach(() => {
        fs.rmSync(cloneRoot, { recursive: true, force: true });
    });

    function runSetup() {
        const fakeBin = path.join(cloneRoot, "fake-bin");
        const fakePnpm = path.join(fakeBin, "pnpm");
        fs.mkdirSync(fakeBin, { recursive: true });
        fs.writeFileSync(fakePnpm, `#!${process.execPath}\nprocess.stdout.write("10.13.1\\n");\n`);
        fs.chmodSync(fakePnpm, 0o755);

        return spawnSync(
            process.execPath,
            [path.join(cloneRoot, "scripts/setup.mjs"), "--skip-seed"],
            {
                cwd: cloneRoot,
                encoding: "utf8",
                env: {
                    ...process.env,
                    PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
                }
            }
        );
    }

    it("runs the documented install and creates local files without seeding or starting MySQL", () => {
        const result = runSetup();

        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(
            JSON.parse(fs.readFileSync(path.join(cloneRoot, "mtg.config.json"), "utf8")),
            JSON.parse(fs.readFileSync(path.join(cloneRoot, "mtg.config.example.json"), "utf8"))
        );
        assert.equal(
            fs.readFileSync(path.join(cloneRoot, "secure.config.cjs"), "utf8"),
            fs.readFileSync(path.join(cloneRoot, "secure.config.template.cjs"), "utf8")
        );
        assert.include(result.stdout, "$ pnpm install");
        assert.notInclude(result.stdout, "Starting local MySQL");
        assert.include(result.stdout, "Skipping name-seed step (--skip-seed)");
    });

    it("preserves existing machine-local configuration on a rerun", () => {
        assert.equal(runSetup().status, 0);
        const configPath = path.join(cloneRoot, "mtg.config.json");
        const secureConfigPath = path.join(cloneRoot, "secure.config.cjs");
        fs.writeFileSync(configPath, '{"queryingEnabled":true}\n');
        fs.writeFileSync(secureConfigPath, "module.exports = { rds: { host: 'local' } };\n");

        const result = runSetup();

        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(configPath, "utf8"), '{"queryingEnabled":true}\n');
        assert.equal(
            fs.readFileSync(secureConfigPath, "utf8"),
            "module.exports = { rds: { host: 'local' } };\n"
        );
    });
});
