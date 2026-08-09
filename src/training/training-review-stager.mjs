import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareOcrVariants } from "../image-processing/ocr-preprocessing.mjs";

const MAX_REVIEW_BATCH_CASES = 50;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

function requireNonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }
}

function markdownText(value) {
    return String(value)
        .replace(/\r?\n/g, " ")
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .trim();
}

function formatReviewSheet(report) {
    const lines = [
        "# OCR training review batch",
        "",
        `Status: ${report.status}`,
        "",
        `Rights/provenance basis: ${report.rightsBasis}`,
        "",
        "Nothing in this directory is approved training data until every applicable checkbox and decision is completed."
    ];
    report.samples.forEach((sample) => {
        const transcription = markdownText(sample.transcription);
        lines.push(
            "",
            `## ${transcription}`,
            "",
            `Source fixture: \`${sample.sourceCaseId}\``,
            "",
            `Expected transcription: \`${transcription}\``,
            "",
            `![${transcription}](./${sample.image})`,
            "",
            "- [ ] Crop contains the complete exact transcription",
            "- [ ] Characters are legible and belong to a single text line",
            "- [ ] Transcription matches capitalization and punctuation",
            "- [ ] Rights/provenance basis is acceptable for this use",
            "- Decision: `approve` / `reject`",
            "- Review notes:"
        );
    });
    return `${lines.join("\n")}\n`;
}

function selectCases(regressionManifest, caseIds) {
    if (!regressionManifest || !Array.isArray(regressionManifest.cases)) {
        throw new Error("A loaded regression manifest is required");
    }
    if (!Array.isArray(caseIds) || caseIds.length === 0) {
        throw new Error("At least one training review case is required");
    }
    if (caseIds.length > MAX_REVIEW_BATCH_CASES) {
        throw new Error(`Training review batches are limited to ${MAX_REVIEW_BATCH_CASES} cases`);
    }
    if (new Set(caseIds).size !== caseIds.length) {
        throw new Error("Training review case IDs must be unique");
    }

    const casesById = new Map(regressionManifest.cases.map((fixture) => [fixture.id, fixture]));
    return caseIds.map((caseId) => {
        const fixture = casesById.get(caseId);
        if (!fixture) {
            throw new Error(`Unknown regression fixture: ${caseId}`);
        }
        if (fixture.enabled !== false) {
            throw new Error(
                `${caseId} is enabled in the regression gate and cannot be training data`
            );
        }
        if (!ID_PATTERN.test(fixture.id)) {
            throw new Error(`${caseId} is not safe to use as a training review filename`);
        }
        const transcription = fixture.expected?.name;
        requireNonEmptyString(transcription, `${caseId} expected name`);
        if (transcription.includes("CHANGE_ME")) {
            throw new Error(`${caseId} still has placeholder ground truth`);
        }
        if (transcription.includes("//")) {
            throw new Error(
                `${caseId} uses a compound card name; supply face-specific ground truth before staging`
            );
        }
        return fixture;
    });
}

async function stageTrainingReviewBatch(regressionManifest, options) {
    const {
        caseIds,
        outputDirectory,
        rightsBasis,
        prepareOcrVariants: prepareVariants = prepareOcrVariants,
        now = () => new Date()
    } = options || {};
    requireNonEmptyString(outputDirectory, "outputDirectory");
    requireNonEmptyString(rightsBasis, "rightsBasis");
    const fixtures = selectCases(regressionManifest, caseIds);
    const absoluteOutput = path.resolve(outputDirectory);
    await mkdir(path.dirname(absoluteOutput), { recursive: true });
    await mkdir(absoluteOutput);

    try {
        const samples = [];
        for (const fixture of fixtures) {
            const prepared = await prepareVariants(fixture.imagePath, "name");
            const variant = prepared.variants?.find(
                (candidate) => candidate.region === "name-core"
            );
            if (
                !variant?.buffer ||
                !Buffer.isBuffer(variant.buffer) ||
                variant.buffer.length === 0
            ) {
                throw new Error(`${fixture.id} did not produce a non-empty name-core crop`);
            }

            const transcription = fixture.expected.name;
            const transcriptionBuffer = Buffer.from(transcription, "utf8");
            const imageFile = `${fixture.id}.png`;
            const transcriptionFile = `${fixture.id}.gt.txt`;
            await Promise.all([
                writeFile(path.join(absoluteOutput, imageFile), variant.buffer, { flag: "wx" }),
                writeFile(path.join(absoluteOutput, transcriptionFile), transcriptionBuffer, {
                    flag: "wx"
                })
            ]);
            samples.push({
                id: fixture.id,
                image: imageFile,
                transcriptionFile,
                transcription,
                imageSha256: sha256(variant.buffer),
                transcriptionSha256: sha256(transcriptionBuffer),
                sourceCaseId: fixture.id,
                region: "name-core",
                reviewed: false
            });
        }

        const report = {
            version: 1,
            status: "unreviewed",
            generatedAt: now().toISOString(),
            sourceManifest: regressionManifest.path,
            rightsBasis,
            samples
        };
        await Promise.all([
            writeFile(
                path.join(absoluteOutput, "review-manifest.json"),
                `${JSON.stringify(report, null, 2)}\n`,
                { encoding: "utf8", flag: "wx" }
            ),
            writeFile(path.join(absoluteOutput, "review.md"), formatReviewSheet(report), {
                encoding: "utf8",
                flag: "wx"
            })
        ]);
        return report;
    } catch (error) {
        await rm(absoluteOutput, { recursive: true, force: true });
        throw error;
    }
}

export { MAX_REVIEW_BATCH_CASES, formatReviewSheet, selectCases, stageTrainingReviewBatch };
