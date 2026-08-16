#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import { importScryfallFixtures } from "../src/regression/scryfall-fixture-importer.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultManifest = path.join(repositoryRoot, "test/regression/fixtures/manifest.json");
const defaultImageDirectory = path.join(repositoryRoot, "test-images/regression/scryfall");

function collect(value, previous) {
    return previous.concat(value);
}

function buildProgram() {
    return new Command()
        .name("mtg-import-scryfall-fixtures")
        .description("Download Scryfall card prints and add OCR regression fixtures")
        .option(
            "-s, --set <code>",
            "Scryfall set code (repeatable or comma-separated)",
            collect,
            []
        )
        .option("--released-after <date>", "include prints released on or after YYYY-MM-DD")
        .option("--released-before <date>", "include prints released on or before YYYY-MM-DD")
        .option(
            "--layout <layout>",
            "Scryfall card layout (repeatable or comma-separated)",
            collect,
            []
        )
        .option(
            "--style <style>",
            "treatment: full-art, borderless, showcase, extended-art, or textless (repeatable)",
            collect,
            []
        )
        .option("--face <side>", "multi-face image side: front or back", "front")
        .requiredOption("-n, --count <number>", "number of new card-print fixtures")
        .option("-m, --manifest <path>", "target regression manifest", defaultManifest)
        .option(
            "-i, --image-directory <path>",
            "downloaded fixture directory",
            defaultImageDirectory
        )
        .option(
            "--existing-manifest <path>",
            "additional manifest whose prints must be excluded (repeatable)",
            collect,
            []
        )
        .option("--max-pages <number>", "maximum Scryfall result pages", "20")
        .option("--balanced", "diversify selected prints across coverage categories", false)
        .option("--seed <number>", "seed the random page/shuffle selection for a reproducible run")
        .option("--dry-run", "show selected prints without writing images or manifest", false);
}

async function main(argv = process.argv, overrides = {}) {
    const options = buildProgram().parse(argv).opts();
    const importer = overrides.importer || importScryfallFixtures;
    const writeLine = overrides.writeLine || console.log;
    const result = await importer({
        manifestPath: options.manifest,
        imageDirectory: options.imageDirectory,
        existingManifestPaths: options.existingManifest,
        sets: options.set,
        layouts: options.layout,
        styles: options.style,
        face: options.face,
        releasedAfter: options.releasedAfter,
        releasedBefore: options.releasedBefore,
        count: options.count,
        maxPages: options.maxPages,
        balanced: options.balanced,
        seed: options.seed,
        dryRun: options.dryRun
    });

    writeLine(`${result.dryRun ? "Would import" : "Imported"} ${result.added.length} fixture(s):`);
    for (const card of result.added) {
        const coverage = options.balanced
            ? ` [${card.colorCategory}; ${card.primaryType}; ${card.layout}; ${card.style}; ${card.rarity}; ${card.face}]`
            : "";
        writeLine(`- ${card.set}/${card.collectorNumber} ${card.name}${coverage}`);
    }
    if (options.balanced) {
        const uniqueCount = (key) => new Set(result.added.map((card) => card[key])).size;
        writeLine(
            `Coverage: sets=${uniqueCount("set")}, color categories=${uniqueCount(
                "colorCategory"
            )}, ` +
                `types=${uniqueCount("primaryType")}, layouts=${uniqueCount("layout")}, ` +
                `styles=${uniqueCount("style")}, rarities=${uniqueCount("rarity")}`
        );
    }
    writeLine(`Excluded existing prints: ${result.excludedExisting}`);
    writeLine(`Skipped cards without usable ${options.face} JPEGs: ${result.skippedUnprintable}`);
    if (!result.dryRun) {
        writeLine("Fixtures disabled pending OCR result and threshold review.");
    }
    return result;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}

export { buildProgram, main };
