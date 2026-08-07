import { assert } from "chai";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matchNameModule from "../../src/fuzzy-matching/match-name.mjs";
import { QUALITY_LEVELS, loadManifest, validateManifest } from "../../src/regression/manifest.mjs";
import { formatBenchmarkReport } from "../../src/regression/report.mjs";
import {
    runRegression,
    summarize,
    summarizeGate
} from "../../src/regression/regression-runner.mjs";

const manifestPath = fileURLToPath(new URL("./fixtures/manifest.json", import.meta.url));
const imageDirectory = fileURLToPath(new URL("../../test-images/", import.meta.url));

describe("Regression framework::", () => {
    it("loads labeled fixtures for every supported quality level", async () => {
        const manifest = await loadManifest(manifestPath);
        assert.sameMembers(
            [...new Set(manifest.cases.map((fixture) => fixture.quality))],
            QUALITY_LEVELS
        );
        manifest.cases.forEach((fixture) => {
            assert.isString(fixture.expected.name);
            assert.isString(fixture.expected.set);
            assert.isString(fixture.expected.collectorNumber);
            assert.isString(fixture.imagePath);
        });
        assert.equal(
            manifest.cases.filter((fixture) => fixture.enabled === false).length,
            manifest.catalog.filter((card) => card.enabled === false).length
        );

        const imageFiles = (await readdir(imageDirectory, { withFileTypes: true }))
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);
        const catalogFiles = manifest.catalog.map((card) => path.basename(card.referenceImagePath));
        assert.sameMembers(catalogFiles, imageFiles);
    });

    it("rejects duplicate fixture ids", () => {
        const rawManifest = {
            version: 1,
            catalog: [
                {
                    name: "Pacifism",
                    set: "BBD",
                    collectorNumber: "101",
                    referenceImage: "pacifism.jpg"
                }
            ],
            cases: ["clean-scan", "blur"].map((quality) => ({
                id: "duplicate",
                image: "pacifism.jpg",
                quality,
                expected: { name: "Pacifism", set: "BBD", collectorNumber: "101" }
            }))
        };
        assert.throws(
            () => validateManifest(rawManifest, "/tmp/manifest.json"),
            "Duplicate regression case id"
        );
    });

    it("runs OCR, local name matching, and offline print verification end to end", async () => {
        const manifest = {
            path: "/fixtures/manifest.json",
            catalog: [
                {
                    name: "Pacifism",
                    set: "BBD",
                    collectorNumber: "101",
                    typeLine: "Enchantment — Aura",
                    colors: ["W"],
                    referenceImagePath: "/fixtures/reference.jpg"
                },
                {
                    name: "Pacifism",
                    set: "M20",
                    collectorNumber: "32",
                    referenceImagePath: "/fixtures/alternative.jpg"
                },
                {
                    enabled: false,
                    name: "CHANGE_ME",
                    set: "CHANGE_ME",
                    collectorNumber: "CHANGE_ME",
                    referenceImagePath: "/fixtures/pending.jpg"
                }
            ],
            cases: [
                {
                    id: "offline-clean",
                    image: "pacifism.jpg",
                    imagePath: "/fixtures/pacifism.jpg",
                    quality: "clean-scan",
                    transform: {},
                    expected: {
                        name: "Pacifism",
                        set: "BBD",
                        collectorNumber: "101",
                        minNameScore: 0.7,
                        maxPrintCandidates: 2,
                        metadata: { typeLine: "Enchantment — Aura", colors: ["W"] }
                    }
                },
                {
                    enabled: false,
                    id: "pending-label",
                    image: "pending.jpg",
                    imagePath: "/fixtures/pending.jpg",
                    quality: "clean-scan",
                    transform: {},
                    expected: {
                        name: "CHANGE_ME",
                        set: "CHANGE_ME",
                        collectorNumber: "CHANGE_ME"
                    }
                }
            ]
        };
        const fakeImageProcessor = {
            create: () => ({
                extract: (callback) =>
                    callback(null, {
                        cleanText: "PACIFISM",
                        dirtyText: "Pacifism\n",
                        confidence: 96,
                        bestVariant: { region: "name-core" }
                    })
            })
        };
        const fakeHash = {
            HashImage: (imagePath, callback) =>
                callback(null, imagePath.includes("alternative") ? "bbbb" : "aaaa"),
            CompareHash: (left, right) => {
                const score = left === right ? 1 : 0;
                return {
                    twoBitMatches: score,
                    fourBitMatches: score,
                    stringCompare: score
                };
            }
        };

        const report = await runRegression(manifest, {
            dependencies: {
                ImageProcessor: fakeImageProcessor,
                MatchName: matchNameModule,
                Hash: fakeHash,
                materializeFixture: async (fixture) => fixture.imagePath
            }
        });

        assert.equal(report.summary.passed, 1);
        assert.deepEqual(report.gate, {
            total: 1,
            passed: 1,
            failed: 0,
            nonBlocking: 0,
            nonBlockingFailed: 0
        });
        assert.deepEqual(report.pending, {
            catalogEntries: 1,
            cases: 1,
            placeholderCases: 1
        });
        assert.isTrue(report.offline);
        assert.deepInclude(report.isolation, {
            applicationPersistence: "disabled",
            imageHashCache: "disabled",
            ocrCache: "disabled"
        });
        assert.equal(report.results[0].ocr.cleanText, "PACIFISM");
        assert.equal(report.results[0].nameMatches[0].name, "Pacifism");
        assert.equal(report.results[0].nameCandidateCount, 1);
        assert.equal(report.results[0].printCandidateCount, 2);
        assert.equal(report.results[0].selectedPrint.card.set, "BBD");
        assert.isTrue(report.results[0].setVerified);
        assert.deepEqual(report.results[0].failures, []);
    });

    it("recomputes every image hash for every case without caching", async () => {
        const manifest = {
            path: "/fixtures/manifest.json",
            catalog: [
                {
                    name: "Pacifism",
                    set: "BBD",
                    collectorNumber: "101",
                    referenceImagePath: "/fixtures/reference.jpg"
                }
            ],
            cases: ["first", "second"].map((id) => ({
                id,
                image: `${id}.jpg`,
                imagePath: `/fixtures/${id}.jpg`,
                quality: "clean-scan",
                expected: { name: "Pacifism", set: "BBD", collectorNumber: "101" }
            }))
        };
        const hashCalls = [];
        const fakeHash = {
            HashImage: (imagePath, callback) => {
                hashCalls.push(imagePath);
                callback(null, "fresh-hash");
            },
            CompareHash: () => ({ twoBitMatches: 1, fourBitMatches: 1, stringCompare: 1 })
        };

        const report = await runRegression(manifest, {
            dependencies: {
                ImageProcessor: {
                    create: () => ({
                        extract: (callback) =>
                            callback(null, {
                                cleanText: "PACIFISM",
                                dirtyText: "Pacifism",
                                confidence: 99,
                                bestVariant: { region: "name-core" }
                            })
                    })
                },
                MatchName: matchNameModule,
                Hash: fakeHash,
                materializeFixture: async (fixture) => fixture.imagePath
            }
        });

        assert.equal(report.summary.passed, 2);
        assert.deepEqual(hashCalls, [
            "/fixtures/first.jpg",
            "/fixtures/reference.jpg",
            "/fixtures/second.jpg",
            "/fixtures/reference.jpg"
        ]);
    });

    it("summarizes failures and renders all benchmark columns", () => {
        const results = [
            {
                id: "clean",
                quality: "clean-scan",
                passed: true,
                runtimeMs: 10,
                ocr: { cleanText: "PACIFISM" },
                nameMatches: [{ name: "Pacifism", percentage: 1 }],
                nameCandidateCount: 1,
                printCandidateCount: 1,
                selectedPrint: {
                    card: { set: "BBD", collectorNumber: "101" },
                    score: 1
                },
                setVerified: true,
                failures: [],
                timings: { ocrMs: 8 }
            },
            {
                id: "blur",
                quality: "blur",
                blocking: false,
                passed: false,
                runtimeMs: 20,
                ocr: { cleanText: "" },
                nameMatches: [],
                nameCandidateCount: 0,
                printCandidateCount: 0,
                selectedPrint: null,
                setVerified: false,
                failures: ["OCR returned no normalized text"],
                timings: { ocrMs: 18 }
            }
        ];
        const report = {
            generatedAt: "2026-08-07T00:00:00.000Z",
            manifest: "/fixtures/manifest.json",
            offline: true,
            isolation: {
                applicationPersistence: "disabled",
                imageHashCache: "disabled",
                ocrCache: "disabled"
            },
            summary: summarize(results),
            gate: summarizeGate(results),
            results
        };
        const markdown = formatBenchmarkReport(report);

        assert.equal(report.summary.passRate, 50);
        assert.equal(report.gate.failed, 0);
        assert.equal(report.gate.nonBlockingFailed, 1);
        assert.include(markdown, "OCR output");
        assert.include(markdown, "Name candidates");
        assert.include(markdown, "Print candidates");
        assert.include(markdown, "Set verified");
        assert.include(markdown, "OCR returned no normalized text");
        assert.include(markdown, "CI gate: PASS");
        assert.include(markdown, "NON-BLOCKING FAIL");
        assert.include(markdown, "image-hash cache disabled");
        assert.include(markdown, "20 ms");
    });
});
