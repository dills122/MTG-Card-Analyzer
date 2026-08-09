#!/usr/bin/env node

import { execFile as execFileCallback, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import {
    assertTrainingDataReady,
    loadTrainingDataManifest
} from "../src/training/training-data-manifest.mjs";
import {
    createOcrTrainingImageBuildPlan,
    createOcrTrainingPlan
} from "../src/training/ocr-training-plan.mjs";
import {
    packageOcrTrainingCandidate,
    prepareOcrTrainingRun
} from "../src/training/ocr-training-runner.mjs";

const execFile = promisify(execFileCallback);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "..");
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function integerOption(value) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new InvalidArgumentError("must be an integer");
    }
    return parsed;
}

function buildProgram(repositoryRoot = defaultRepositoryRoot) {
    return new Command()
        .name("train-ocr-model")
        .description("Fine-tune and package a reviewed OCR corpus with pinned tesstrain inputs")
        .requiredOption("--run <id>", "safe, unique local training-run identifier")
        .option(
            "-m, --manifest <path>",
            "reviewed training-data manifest",
            path.join(repositoryRoot, "training/ocr/manifest.json")
        )
        .option(
            "--output-root <directory>",
            "ignored training-run artifact root",
            path.join(repositoryRoot, "artifacts/training-runs")
        )
        .option("--max-iterations <count>", "bounded fine-tuning iterations", integerOption, 10_000)
        .option("--cpus <count>", "Docker CPU limit", integerOption, 4)
        .option("--memory-gb <count>", "Docker memory limit in GiB", integerOption, 4)
        .option("--build-image", "build the pinned local training image before running")
        .option("--dry-run", "validate readiness and print commands without writing artifacts")
        .option("--source-revision <revision>", "explicit candidate provenance revision");
}

function formatCommand(command) {
    return [command.executable, ...command.args]
        .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
        .join(" ");
}

function runCommand(executable, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd: options.cwd,
            env: process.env,
            shell: false,
            stdio: "inherit"
        });
        child.once("error", reject);
        child.once("close", (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(
                new Error(
                    signal
                        ? `${executable} terminated by signal ${signal}`
                        : `${executable} exited with code ${code}`
                )
            );
        });
    });
}

async function getSourceRevision(repositoryRoot) {
    const { stdout } = await execFile("git", ["rev-parse", "HEAD"], {
        cwd: repositoryRoot,
        encoding: "utf8"
    });
    return stdout.trim();
}

async function main(argv = process.argv, overrides = {}) {
    const repositoryRoot = path.resolve(overrides.repositoryRoot || defaultRepositoryRoot);
    const {
        loadTrainingDataManifest: loadManifest = loadTrainingDataManifest,
        assertTrainingDataReady: assertReady = assertTrainingDataReady,
        createOcrTrainingPlan: createPlan = createOcrTrainingPlan,
        createOcrTrainingImageBuildPlan: createBuildPlan = createOcrTrainingImageBuildPlan,
        prepareOcrTrainingRun: prepareRun = prepareOcrTrainingRun,
        packageOcrTrainingCandidate: packageCandidate = packageOcrTrainingCandidate,
        runCommand: execute = runCommand,
        getSourceRevision: resolveSourceRevision = getSourceRevision,
        writeLine = console.log
    } = overrides;
    const options = buildProgram(repositoryRoot).parse(argv).opts();
    if (!RUN_ID_PATTERN.test(options.run)) {
        throw new Error("Run ID must use lowercase letters, numbers, dots, dashes, or underscores");
    }

    const manifest = await loadManifest(options.manifest);
    const readiness = assertReady(manifest);
    const runDirectory = path.resolve(options.outputRoot, options.run);
    const plan = createPlan(manifest, {
        runDirectory,
        maxIterations: options.maxIterations,
        cpus: options.cpus,
        memoryGb: options.memoryGb
    });
    const buildPlan = options.buildImage ? createBuildPlan(repositoryRoot) : null;

    if (options.dryRun) {
        writeLine(
            `Training data ready: ${readiness.total} samples (${readiness.train} train / ${readiness.evaluation} evaluation)`
        );
        if (buildPlan) {
            writeLine(formatCommand(buildPlan));
        }
        writeLine(formatCommand(plan.command));
        return { manifest, readiness, plan, buildPlan };
    }

    if (buildPlan) {
        await execute(buildPlan.executable, buildPlan.args, { cwd: repositoryRoot });
    }
    await prepareRun(manifest, plan);
    try {
        await execute(plan.command.executable, plan.command.args, { cwd: repositoryRoot });
    } catch (error) {
        throw new Error(
            `Training failed; preserved run artifacts at ${runDirectory}: ${error.message}`,
            { cause: error }
        );
    }
    const sourceRevision = options.sourceRevision || (await resolveSourceRevision(repositoryRoot));
    const candidate = await packageCandidate(manifest, plan, {
        candidateId: `${manifest.modelName}-${options.run}`,
        sourceRevision
    });
    writeLine(`OCR candidate: ${candidate.candidateId}`);
    writeLine(`Candidate manifest: ${candidate.manifestPath}`);
    return { manifest, readiness, plan, buildPlan, candidate };
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}

export { buildProgram, formatCommand, getSourceRevision, main, runCommand };
