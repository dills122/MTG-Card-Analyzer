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

async function listRelativeFiles(directory, relativeDirectory = "") {
    const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
    const files = await Promise.all(
        entries.map((entry) => {
            const relativePath = path.join(relativeDirectory, entry.name);
            return entry.isDirectory()
                ? listRelativeFiles(directory, relativePath)
                : Promise.resolve([relativePath]);
        })
    );
    return files.flat();
}

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

        const rootImageFiles = (await readdir(imageDirectory, { withFileTypes: true }))
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);
        const importedImageFiles = (
            await listRelativeFiles(path.join(imageDirectory, "regression"))
        ).map((relativePath) => path.join("regression", relativePath));
        const imageFiles = [...rootImageFiles, ...importedImageFiles];
        const catalogFiles = manifest.catalog.map((card) =>
            path.relative(imageDirectory, card.referenceImagePath)
        );
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
            hashImage: (imagePath, callback) =>
                callback(null, imagePath.includes("alternative") ? "bbbb" : "aaaa"),
            compareHash: (left, right) => {
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
            hashImage: (imagePath, callback) => {
                hashCalls.push(imagePath);
                callback(null, "fresh-hash");
            },
            compareHash: () => ({ twoBitMatches: 1, fourBitMatches: 1, stringCompare: 1 })
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

    it("reuses one OCR session for the selected cases and terminates it after the batch", async () => {
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
        const ocrSession = {
            recognize: async () => ({ data: { text: "Pacifism" } }),
            terminateCalls: 0,
            async terminate() {
                this.terminateCalls += 1;
            }
        };
        const receivedSessions = [];
        let receivedSessionOptions;
        let createSessionCalls = 0;
        const ocrModel = {
            id: "official-eng-fast",
            family: "tessdata_fast",
            sha256: "b".repeat(64),
            sizeBytes: 4_113_088,
            modelPath: "/fixtures/models/fast/eng.traineddata",
            languagePath: "/fixtures/models/fast",
            source: {
                url: "https://github.com/tesseract-ocr/tessdata_fast",
                revision: "reviewed-ref",
                license: "Apache-2.0"
            },
            engine: { package: "tesseract.js", version: "3.0.3" }
        };

        const report = await runRegression(manifest, {
            ocrModel,
            dependencies: {
                ImageProcessor: {
                    create: ({ ocrOptions }) => {
                        receivedSessions.push(ocrOptions.session);
                        return {
                            extract: (callback) =>
                                callback(null, {
                                    cleanText: "PACIFISM",
                                    dirtyText: "Pacifism",
                                    confidence: 99,
                                    bestVariant: { region: "name-core" }
                                })
                        };
                    }
                },
                MatchName: matchNameModule,
                Hash: {
                    hashImage: (_imagePath, callback) => callback(null, "fresh-hash"),
                    compareHash: () => ({
                        twoBitMatches: 1,
                        fourBitMatches: 1,
                        stringCompare: 1
                    })
                },
                materializeFixture: async (fixture) => fixture.imagePath,
                createOcrSession: async (options) => {
                    createSessionCalls += 1;
                    receivedSessionOptions = options;
                    return ocrSession;
                }
            }
        });

        assert.equal(report.summary.passed, 2);
        assert.equal(createSessionCalls, 1);
        assert.include(receivedSessionOptions, {
            cacheMethod: "none",
            langPath: "/fixtures/models/fast",
            gzip: false
        });
        assert.deepEqual(receivedSessions, [ocrSession, ocrSession]);
        assert.equal(ocrSession.terminateCalls, 1);
        assert.deepEqual(report.ocrModel, {
            id: "official-eng-fast",
            family: "tessdata_fast",
            sha256: "b".repeat(64),
            sizeBytes: 4_113_088,
            source: ocrModel.source,
            engine: ocrModel.engine
        });
        assert.equal(report.isolation.ocrLanguageSource, "OCR candidate official-eng-fast");
        assert.equal(
            report.isolation.ocrWorkerLifecycle,
            "shared process; adaptive state reset per crop"
        );
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
            ocrModel: {
                id: "official-eng-fast",
                family: "tessdata_fast",
                sha256: "b".repeat(64),
                sizeBytes: 4_113_088
            },
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
        assert.include(markdown, "official-eng-fast");
        assert.include(markdown, "tessdata_fast");
        assert.include(markdown, `${"b".repeat(12)}…`);
        assert.include(markdown, "20 ms");
    });
});
