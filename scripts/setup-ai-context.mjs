#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const pinPath = path.join(repositoryRoot, ".codex", "ai-central-pin.json");
const isEntrypoint = Boolean(
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
);

const profiles = ["base", "javascript-typescript", "infrastructure-opentofu"];
const bundles = ["core", "brevity", "engineering", "planning", "infra", "workflow"];

export function getAiCentralSelection() {
    return {
        profiles: [...profiles],
        bundles: [...bundles]
    };
}

function usage() {
    process.stdout.write(`Usage: node scripts/setup-ai-context.mjs [option]

Create, repair, or validate local links to the sibling AI Central checkout.

Options:
  --dry-run     Preview changes without writing.
  --check       Validate the pin, repository-owned files, and managed links.
  --record-pin  Record the current reviewed AI Central commit, then exit.
  --help        Show this help.

Environment:
  AI_CENTRAL_HOME  AI Central repository root or templates directory.
                   Defaults to ../ai-central.
`);
}

export function resolveAiCentralLayout(input, projectRoot = repositoryRoot) {
    const requested = input ?? path.resolve(projectRoot, "../ai-central");
    const absolute = path.resolve(requested);

    if (path.basename(absolute) === "templates") {
        return { aiCentralRoot: path.dirname(absolute), templatesRoot: absolute };
    }

    return { aiCentralRoot: absolute, templatesRoot: path.join(absolute, "templates") };
}

async function pathExists(target) {
    try {
        await fs.lstat(target);
        return true;
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

export async function findGitRoot(startDirectory) {
    let current = path.resolve(startDirectory);

    for (;;) {
        if (await pathExists(path.join(current, ".git"))) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
}

export async function resolveAiCentralCommit(templatesRoot) {
    const gitRoot = await findGitRoot(templatesRoot);
    if (!gitRoot) {
        return undefined;
    }

    try {
        const { stdout } = await execFileAsync("git", ["-C", gitRoot, "rev-parse", "HEAD"]);
        return stdout.trim();
    } catch {
        return undefined;
    }
}

export async function hasTrackedAiCentralChanges(templatesRoot) {
    const gitRoot = await findGitRoot(templatesRoot);
    if (!gitRoot) {
        return false;
    }

    try {
        const { stdout } = await execFileAsync("git", [
            "-C",
            gitRoot,
            "status",
            "--porcelain",
            "--untracked-files=no"
        ]);
        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}

export async function readPin(filePath = pinPath) {
    try {
        return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") {
            return { expectedCommit: null };
        }
        throw error;
    }
}

export function evaluatePin(pin, currentCommit, { dirty = false } = {}) {
    if (!pin.expectedCommit) {
        return { status: "unpinned" };
    }
    if (!currentCommit) {
        return { status: "not-git" };
    }
    if (dirty) {
        return { status: "dirty" };
    }
    if (pin.expectedCommit !== currentCommit) {
        return { status: "mismatch" };
    }
    return { status: "ok" };
}

async function writePin(filePath, expectedCommit) {
    const payload = {
        expectedCommit,
        note: "Reviewed AI Central revision used by pnpm ai:setup. Update only with --record-pin after review."
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 4)}\n`);
}

export async function ensureSymlink(linkPath, target, { dryRun = false } = {}) {
    const absoluteTarget = path.resolve(target);
    let existing;

    try {
        existing = await fs.lstat(linkPath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    if (existing && !existing.isSymbolicLink()) {
        return { action: "preserved", linkPath, target: absoluteTarget };
    }

    if (existing?.isSymbolicLink()) {
        const currentTarget = await fs.readlink(linkPath);
        const resolvedCurrent = path.resolve(path.dirname(linkPath), currentTarget);
        if (resolvedCurrent === absoluteTarget) {
            return { action: "unchanged", linkPath, target: absoluteTarget };
        }
        if (!dryRun) {
            await fs.unlink(linkPath);
        }
    }

    if (!dryRun) {
        await fs.mkdir(path.dirname(linkPath), { recursive: true });
        await fs.symlink(absoluteTarget, linkPath);
    }

    return { action: existing ? "updated" : "created", linkPath, target: absoluteTarget };
}

function managedLinks(layout) {
    const cavemanRoot = path.join(layout.templatesRoot, "skills", "imported", "caveman");
    const personaRoot = path.join(layout.aiCentralRoot, "external", "agent-skills", "agents");

    return [
        {
            linkPath: path.join(repositoryRoot, ".codex", "skills", "cavecrew"),
            target: path.join(cavemanRoot, "skills", "cavecrew")
        },
        {
            linkPath: path.join(repositoryRoot, ".claude", "skills"),
            target: path.join(repositoryRoot, ".codex", "skills")
        },
        {
            linkPath: path.join(repositoryRoot, ".agents", "skills"),
            target: path.join(repositoryRoot, ".codex", "skills")
        },
        ...["cavecrew-investigator", "cavecrew-builder", "cavecrew-reviewer"].map((name) => ({
            linkPath: path.join(repositoryRoot, ".claude", "agents", `${name}.md`),
            target: path.join(cavemanRoot, "agents", `${name}.md`)
        })),
        ...["code-reviewer", "security-auditor", "test-engineer"].map((name) => ({
            linkPath: path.join(repositoryRoot, ".claude", "agents", `${name}.md`),
            target: path.join(personaRoot, `${name}.md`)
        }))
    ];
}

async function assertCentralLayout(layout) {
    const setupScript = path.join(layout.aiCentralRoot, "scripts", "setup-ai-context.sh");
    if (!(await pathExists(setupScript))) {
        throw new Error(
            `AI Central setup script not found at ${setupScript}. Set AI_CENTRAL_HOME correctly.`
        );
    }
    return setupScript;
}

async function assertPin(layout) {
    const pin = await readPin();
    const currentCommit = await resolveAiCentralCommit(layout.templatesRoot);
    const dirty = await hasTrackedAiCentralChanges(layout.templatesRoot);
    const evaluation = evaluatePin(pin, currentCommit, { dirty });

    if (evaluation.status === "unpinned") {
        throw new Error(
            "AI Central is not pinned. Run `pnpm ai:setup -- --record-pin` after review."
        );
    }
    if (evaluation.status === "not-git") {
        throw new Error(`AI Central at ${layout.aiCentralRoot} is not a Git checkout.`);
    }
    if (evaluation.status === "dirty") {
        throw new Error(
            `AI Central at ${layout.aiCentralRoot} has tracked uncommitted changes; the pinned bytes cannot be verified.`
        );
    }
    if (evaluation.status === "mismatch") {
        throw new Error(
            `AI Central commit ${currentCommit} does not match pinned commit ${pin.expectedCommit}. ` +
                "Review the update, then run `pnpm ai:setup -- --record-pin`, or restore the pin."
        );
    }

    return currentCommit;
}

async function runCentralSetup(setupScript, dryRun) {
    const args = [
        repositoryRoot,
        "--profiles",
        profiles.join(","),
        "--bundles",
        bundles.join(","),
        "--yes",
        "--mode",
        "link"
    ];
    if (dryRun) {
        args.push("--dry-run");
    }

    const { stdout, stderr } = await execFileAsync(setupScript, args, {
        cwd: path.dirname(path.dirname(setupScript))
    });
    process.stdout.write(stdout);
    process.stderr.write(stderr);
}

async function validateOwnedFiles() {
    const ownedFiles = [
        "AGENTS.md",
        "CLAUDE.md",
        ".codex/AI_CENTRAL.md",
        ".codex/ai-central-pin.json",
        ".codex/steering/repository-steering.md",
        ".codex/steering/testing-quality-gates-steering.md",
        ".codex/steering/infrastructure-opentofu-steering.md",
        "scripts/setup-ai-context.mjs"
    ];

    for (const relativePath of ownedFiles) {
        const absolutePath = path.join(repositoryRoot, relativePath);
        if (!(await pathExists(absolutePath))) {
            throw new Error(`Missing repository-owned AI file: ${relativePath}`);
        }

        const contents = await fs.readFile(absolutePath, "utf8");
        if (/\{\{[^}]+\}\}/u.test(contents)) {
            throw new Error(`Unresolved scaffold placeholder in ${relativePath}`);
        }
    }
}

async function validateSymlink(linkPath, expectedTarget) {
    let stat;
    try {
        stat = await fs.lstat(linkPath);
    } catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(`Missing managed symlink: ${path.relative(repositoryRoot, linkPath)}`);
        }
        throw error;
    }

    if (!stat.isSymbolicLink()) {
        throw new Error(
            `Managed path is not a symlink: ${path.relative(repositoryRoot, linkPath)}`
        );
    }

    const actual = path.resolve(path.dirname(linkPath), await fs.readlink(linkPath));
    if (actual !== path.resolve(expectedTarget)) {
        throw new Error(
            `Managed symlink has wrong target: ${path.relative(repositoryRoot, linkPath)} -> ${actual}`
        );
    }
    if (!(await pathExists(actual))) {
        throw new Error(`Managed symlink is broken: ${path.relative(repositoryRoot, linkPath)}`);
    }
}

async function validateSkillLinks(layout) {
    const requiredSkills = [
        "github-keychain-auth",
        "planning-files-lite",
        "caveman",
        "caveman-help",
        "caveman-commit",
        "caveman-review",
        "caveman-compress",
        "cavecrew",
        "code-simplification",
        "claude-ship-gate",
        "planning-with-files",
        "terraform-skill",
        "toolkit-qa-test-planner"
    ];

    for (const skill of requiredSkills) {
        const skillPath = path.join(repositoryRoot, ".codex", "skills", skill);
        const stat = await fs.lstat(skillPath).catch(() => undefined);
        if (!stat?.isSymbolicLink() || !(await pathExists(path.join(skillPath, "SKILL.md")))) {
            throw new Error(`Missing or invalid required skill link: ${skill}`);
        }
    }

    const entries = await fs.readdir(path.join(repositoryRoot, ".codex", "skills"), {
        withFileTypes: true
    });
    for (const entry of entries) {
        const skillPath = path.join(repositoryRoot, ".codex", "skills", entry.name);
        const stat = await fs.lstat(skillPath);
        if (stat.isSymbolicLink() && !(await pathExists(skillPath))) {
            throw new Error(`Broken skill link: ${entry.name}`);
        }
    }

    await validateSymlink(
        path.join(repositoryRoot, ".codex", "steering", "javascript-typescript-steering.md"),
        path.join(layout.templatesRoot, "steering", "javascript-typescript-steering.md")
    );
}

async function checkIntegration(layout) {
    await assertCentralLayout(layout);
    const commit = await assertPin(layout);
    await validateOwnedFiles();
    await validateSkillLinks(layout);
    for (const link of managedLinks(layout)) {
        await validateSymlink(link.linkPath, link.target);
    }
    process.stdout.write(`AI integration valid at AI Central commit ${commit}.\n`);
}

async function main() {
    const args = new Set(process.argv.slice(2).filter((argument) => argument !== "--"));
    const allowed = new Set(["--dry-run", "--check", "--record-pin", "--help", "-h"]);
    const unknown = [...args].find((argument) => !allowed.has(argument));
    if (unknown) {
        throw new Error(`Unknown option: ${unknown}`);
    }
    if (args.has("--help") || args.has("-h")) {
        usage();
        return;
    }

    const modes = ["--dry-run", "--check", "--record-pin"].filter((mode) => args.has(mode));
    if (modes.length > 1) {
        throw new Error(`Choose only one mode: ${modes.join(", ")}`);
    }

    const layout = resolveAiCentralLayout(process.env.AI_CENTRAL_HOME);
    const setupScript = await assertCentralLayout(layout);

    if (args.has("--record-pin")) {
        const commit = await resolveAiCentralCommit(layout.templatesRoot);
        if (!commit) {
            throw new Error(`Cannot resolve an AI Central Git commit at ${layout.aiCentralRoot}.`);
        }
        if (await hasTrackedAiCentralChanges(layout.templatesRoot)) {
            throw new Error("Refusing to pin AI Central while it has tracked uncommitted changes.");
        }
        await writePin(pinPath, commit);
        process.stdout.write(`Recorded AI Central pin: ${commit}\n`);
        return;
    }

    if (args.has("--check")) {
        await checkIntegration(layout);
        return;
    }

    await assertPin(layout);
    const dryRun = args.has("--dry-run");
    await runCentralSetup(setupScript, dryRun);

    const results = [];
    for (const link of managedLinks(layout)) {
        results.push(await ensureSymlink(link.linkPath, link.target, { dryRun }));
    }

    for (const result of results.filter(
        (item) => !["unchanged", "preserved"].includes(item.action)
    )) {
        process.stdout.write(
            `${result.action}: ${path.relative(repositoryRoot, result.linkPath)} -> ${result.target}\n`
        );
    }

    const preserved = results.filter((result) => result.action === "preserved");
    if (preserved.length > 0) {
        throw new Error(
            `Refused to replace non-symlink managed paths: ${preserved
                .map((result) => path.relative(repositoryRoot, result.linkPath))
                .join(", ")}`
        );
    }

    process.stdout.write(`Managed AI links checked: ${results.length}.\n`);
}

if (isEntrypoint) {
    main().catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}
