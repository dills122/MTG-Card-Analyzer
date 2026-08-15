import { rejects } from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assert } from "chai";
import { loadManifest } from "../../src/regression/manifest.mjs";
import {
    buildProgram,
    generateCropReview,
    main,
    ownershipMarkerContent,
    ownershipMarkerFile,
    safeSegment,
    selectReviewCases
} from "../../scripts/generate-crop-review.mjs";

const manifestPath = new URL("../regression/fixtures/manifest.json", import.meta.url).pathname;

describe("generate-crop-review::", () => {
    let directory;

    beforeEach(async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), "mtg-crop-review-"));
    });

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    it("selects enabled fixtures by default and supports explicit disabled cases", () => {
        const manifest = {
            cases: [
                { id: "enabled", quality: "clean-scan" },
                { id: "disabled", quality: "blur", enabled: false }
            ]
        };

        assert.deepEqual(
            selectReviewCases(manifest).map((fixture) => fixture.id),
            ["enabled"]
        );
        assert.deepEqual(
            selectReviewCases(manifest, { caseIds: ["disabled"] }).map((fixture) => fixture.id),
            ["disabled"]
        );
        assert.throws(
            () => selectReviewCases(manifest, { regions: ["unknown"] }),
            "Unknown crop type(s): unknown"
        );
    });

    it("creates stable, traversal-safe asset segments", () => {
        assert.match(safeSegment("../../Pacifism Clean"), /^pacifism-clean-[a-f0-9]{8}$/);
        assert.notEqual(safeSegment("same value"), safeSegment("same-value"));
    });

    it("generates review JSON and production set-symbol assets for a fixture", async () => {
        const manifest = await loadManifest(manifestPath);
        const outputDirectory = path.join(directory, "generated");
        const report = await generateCropReview(manifest, {
            outputDirectory,
            caseIds: ["pacifism-clean-scan"],
            regions: ["set-symbol"],
            now: () => new Date("2026-08-15T12:00:00.000Z")
        });

        assert.deepInclude(report.summary, { cases: 1, crops: 1, errors: 0 });
        assert.equal(report.generatedAt, "2026-08-15T12:00:00.000Z");
        assert.equal(report.cases[0].crops[0].type, "set-symbol");
        assert.match(report.cases[0].crops[0].sha256, /^[a-f0-9]{64}$/);
        const written = JSON.parse(
            await readFile(path.join(outputDirectory, "review-data.json"), "utf8")
        );
        assert.equal(written.datasetId, report.datasetId);
        assert.match(written.cases[0].source.src, /^crop-review\/generated\/cases\//);
        await readFile(
            path.join(
                outputDirectory,
                written.cases[0].crops[0].src.replace("crop-review/generated/", "")
            )
        );
    });

    it("removes staging output when generation is interrupted", async () => {
        const manifest = await loadManifest(manifestPath);
        const outputDirectory = path.join(directory, "interrupted");

        await rejects(
            generateCropReview(manifest, {
                outputDirectory,
                caseIds: ["pacifism-clean-scan"],
                regions: ["set-symbol"],
                onProgress: () => process.emit("SIGINT")
            }),
            /Crop review generation interrupted by SIGINT/
        );
        await rejects(access(outputDirectory), /ENOENT/);
    });

    it("refuses to replace an output directory it does not own", async () => {
        const manifest = await loadManifest(manifestPath);
        const outputDirectory = path.join(directory, "unrelated");
        const existingFile = path.join(outputDirectory, "keep.txt");
        await mkdir(outputDirectory);
        await writeFile(existingFile, "keep me", "utf8");

        await rejects(
            generateCropReview(manifest, {
                outputDirectory,
                caseIds: ["pacifism-clean-scan"],
                regions: ["set-symbol"]
            }),
            /Refusing to replace output directory not created by crop review/
        );
        assert.equal(await readFile(existingFile, "utf8"), "keep me");
    });

    it("replaces output carrying its ownership marker", async () => {
        const manifest = await loadManifest(manifestPath);
        const outputDirectory = path.join(directory, "owned");
        await mkdir(outputDirectory);
        await writeFile(
            path.join(outputDirectory, ownershipMarkerFile),
            ownershipMarkerContent,
            "utf8"
        );

        await generateCropReview(manifest, {
            outputDirectory,
            caseIds: ["pacifism-clean-scan"],
            regions: ["set-symbol"]
        });

        assert.equal(
            await readFile(path.join(outputDirectory, ownershipMarkerFile), "utf8"),
            ownershipMarkerContent
        );
    });

    it("parses filters and delegates CLI generation", async () => {
        const options = buildProgram()
            .parse([
                "node",
                "generate-crop-review.mjs",
                "--case",
                "pacifism-clean-scan",
                "--region",
                "name",
                "--output",
                directory
            ])
            .opts();
        assert.deepEqual(options.case, ["pacifism-clean-scan"]);
        assert.deepEqual(options.region, ["name"]);

        const manifest = { cases: [] };
        const lines = [];
        let received;
        await main(
            [
                "node",
                "generate-crop-review.mjs",
                "--case",
                "pacifism-clean-scan",
                "--output",
                directory
            ],
            {
                loadManifest: async () => manifest,
                generateCropReview: async (input, generationOptions) => {
                    received = { input, generationOptions };
                    return { summary: { cases: 1, crops: 21, errors: 0 } };
                },
                writeLine: (line) => lines.push(line)
            }
        );
        assert.strictEqual(received.input, manifest);
        assert.deepEqual(received.generationOptions.caseIds, ["pacifism-clean-scan"]);
        assert.include(lines[0], "21 crop(s)");
    });
});
