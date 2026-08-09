#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import { promoteTrainingReviewBatch } from "../src/training/training-review-promoter.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "..");

function collect(value, previous) {
    return previous.concat(value);
}

function concernOption(value) {
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) {
        throw new InvalidArgumentError("must use <sample-id>=<review concern>");
    }
    return { id: value.slice(0, separator), concern: value.slice(separator + 1) };
}

function collectConcern(value, previous) {
    return previous.concat(concernOption(value));
}

function approvalNoteOption(value) {
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) {
        throw new InvalidArgumentError("must use <sample-id>=<positive review note>");
    }
    return { id: value.slice(0, separator), notes: value.slice(separator + 1) };
}

function collectApprovalNote(value, previous) {
    return previous.concat(approvalNoteOption(value));
}

function buildProgram(repositoryRoot = defaultRepositoryRoot) {
    return new Command()
        .name("promote-ocr-training-review")
        .description("Promote an explicitly reviewed local OCR batch into ground truth")
        .requiredOption("--batch-dir <directory>", "local staged review batch")
        .option("--approve <id>", "approved sample ID (repeatable)", collect, [])
        .option(
            "--approve-note <id=note>",
            "approved sample with a positive provenance note (repeatable)",
            collectApprovalNote,
            []
        )
        .option(
            "--concern <id=note>",
            "approved-with-concern sample and note (repeatable)",
            collectConcern,
            []
        )
        .option("--reject <id>", "rejected sample ID (repeatable)", collect, [])
        .option(
            "-m, --manifest <path>",
            "target training-data manifest",
            path.join(repositoryRoot, "training/ocr/manifest.json")
        );
}

async function main(argv = process.argv, overrides = {}) {
    const repositoryRoot = path.resolve(overrides.repositoryRoot || defaultRepositoryRoot);
    const {
        promoteTrainingReviewBatch: promote = promoteTrainingReviewBatch,
        writeLine = console.log
    } = overrides;
    const options = buildProgram(repositoryRoot).parse(argv).opts();
    const approvalDecisions = [
        ...options.approve.map((id) => ({ id })),
        ...options.approveNote,
        ...options.concern
    ];
    const approvalIds = new Set();
    const duplicateApprovalIds = new Set();
    for (const decision of approvalDecisions) {
        if (approvalIds.has(decision.id)) {
            duplicateApprovalIds.add(decision.id);
        }
        approvalIds.add(decision.id);
    }
    if (duplicateApprovalIds.size > 0) {
        throw new Error(
            `Samples cannot appear in more than one approval option: ${[...duplicateApprovalIds].join(", ")}`
        );
    }
    const batchDirectory = path.resolve(options.batchDir);
    const result = await promote({
        reviewManifestPath: path.join(batchDirectory, "review-manifest.json"),
        trainingManifestPath: path.resolve(options.manifest),
        approved: approvalDecisions,
        rejectedIds: options.reject
    });
    writeLine(
        `Promoted ${result.approved.length} reviewed sample(s); rejected ${result.rejected.length}`
    );
    writeLine(`Training manifest: ${result.trainingManifestPath}`);
    return result;
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}

export { approvalNoteOption, buildProgram, concernOption, main };
