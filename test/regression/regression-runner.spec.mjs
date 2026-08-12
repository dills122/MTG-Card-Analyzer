import { assert } from "chai";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matchNameModule from "../../src/fuzzy-matching/match-name.mjs";
import { QUALITY_LEVELS, loadManifest, validateManifest } from "../../src/regression/manifest.mjs";
import { formatBenchmarkReport } from "../../src/regression/report.mjs";
import {
    maximumCasesPerOcrSession,
    maximumOcrWorkers,
    resolveOcrWorkerCount,
    runRegression,
    shardCases,
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
    it("validates and deterministically shards the requested OCR worker count", () => {
        const fixtures = Array.from({ length: 7 }, (_, index) => ({ id: `case-${index}` }));
        const shards = shardCases(fixtures, 3);

        assert.equal(resolveOcrWorkerCount(undefined), 1);
        assert.equal(resolveOcrWorkerCount(maximumOcrWorkers), maximumOcrWorkers);
        assert.throws(() => resolveOcrWorkerCount(0), "must be an integer from 1 to 3");
        assert.throws(() => resolveOcrWorkerCount(1.5), "must be an integer from 1 to 3");
        assert.deepEqual(
            shards.map((shard) => shard.map(({ fixture, index }) => [fixture.id, index])),
            [
                [
                    ["case-0", 0],
                    ["case-3", 3],
                    ["case-6", 6]
                ],
                [
                    ["case-1", 1],
                    ["case-4", 4]
                ],
                [
                    ["case-2", 2],
                    ["case-5", 5]
                ]
            ]
        );
    });

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
                    scryfallId: "bbd-101",
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
                    scryfallId: "bbd-101",
                    typeLine: "Enchantment — Aura",
                    colors: ["W"],
                    referenceImagePath: "/fixtures/reference.jpg"
                },
                {
                    name: "Pacifism",
                    set: "BBD",
                    collectorNumber: "301",
                    scryfallId: "bbd-301",
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
                        scryfallId: "bbd-101",
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
                return { similarity: score };
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
        assert.equal(report.results[0].selectedPrint.card.scryfallId, "bbd-101");
        assert.isTrue(report.results[0].exactPrintVerified);
        assert.isTrue(report.results[0].setVerified);
        assert.deepEqual(report.summary.exactPrints, { total: 1, verified: 1 });
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
            compareHash: () => ({ similarity: 1 })
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
                    compareHash: () => ({ similarity: 1 })
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
            "shared sequentially for at most 40 cases; adaptive state reset per crop"
        );
    });

    it("recycles the OCR worker after the fixed case budget", async () => {
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
            cases: Array.from({ length: maximumCasesPerOcrSession + 1 }, (_, index) => ({
                id: `case-${index}`,
                image: `case-${index}.jpg`,
                imagePath: `/fixtures/case-${index}.jpg`,
                quality: "clean-scan",
                expected: { name: "Pacifism", set: "BBD", collectorNumber: "101" }
            }))
        };
        const sessions = [];
        const receivedSessions = [];

        const report = await runRegression(manifest, {
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
                    compareHash: () => ({ similarity: 1 })
                },
                materializeFixture: async (fixture) => fixture.imagePath,
                createOcrSession: async () => {
                    const session = {
                        terminateCalls: 0,
                        async terminate() {
                            this.terminateCalls += 1;
                        }
                    };
                    sessions.push(session);
                    return session;
                }
            }
        });

        assert.equal(report.summary.passed, maximumCasesPerOcrSession + 1);
        assert.lengthOf(sessions, 2);
        assert.deepEqual(
            receivedSessions.slice(0, maximumCasesPerOcrSession),
            Array(maximumCasesPerOcrSession).fill(sessions[0])
        );
        assert.equal(receivedSessions.at(-1), sessions[1]);
        assert.deepEqual(
            sessions.map((session) => session.terminateCalls),
            [1, 1]
        );
    });

    it("runs independent OCR shards concurrently and restores manifest result order", async () => {
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
            cases: Array.from({ length: 6 }, (_, index) => ({
                id: `case-${index}`,
                image: `case-${index}.jpg`,
                imagePath: `/fixtures/case-${index}.jpg`,
                quality: "clean-scan",
                expected: { name: "Pacifism", set: "BBD", collectorNumber: "101" }
            }))
        };
        const sessions = [];
        const assignments = [];
        let activeExtractions = 0;
        let maximumActiveExtractions = 0;

        const report = await runRegression(manifest, {
            workers: 3,
            dependencies: {
                ImageProcessor: {
                    create: ({ path: imagePath, ocrOptions }) => ({
                        extract: (callback) => {
                            assignments.push([imagePath, ocrOptions.session.id]);
                            activeExtractions += 1;
                            maximumActiveExtractions = Math.max(
                                maximumActiveExtractions,
                                activeExtractions
                            );
                            setTimeout(() => {
                                activeExtractions -= 1;
                                callback(null, {
                                    cleanText: "PACIFISM",
                                    dirtyText: "Pacifism",
                                    confidence: 99,
                                    bestVariant: { region: "name-core" }
                                });
                            }, 10);
                        }
                    })
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
                createOcrSession: async () => {
                    const session = {
                        id: sessions.length,
                        terminateCalls: 0,
                        async terminate() {
                            this.terminateCalls += 1;
                        }
                    };
                    sessions.push(session);
                    return session;
                }
            }
        });

        assert.equal(maximumActiveExtractions, 3);
        assert.deepEqual(
            report.results.map((result) => result.id),
            manifest.cases.map((fixture) => fixture.id)
        );
        assert.sameDeepMembers(assignments, [
            ["/fixtures/case-0.jpg", 0],
            ["/fixtures/case-1.jpg", 1],
            ["/fixtures/case-2.jpg", 2],
            ["/fixtures/case-3.jpg", 0],
            ["/fixtures/case-4.jpg", 1],
            ["/fixtures/case-5.jpg", 2]
        ]);
        assert.deepEqual(
            sessions.map((session) => session.terminateCalls),
            [1, 1, 1]
        );
        assert.equal(report.isolation.ocrWorkers, 3);
        assert.equal(
            report.isolation.ocrWorkerLifecycle,
            "3 parallel shards; each shared for at most 40 cases; adaptive state reset per crop"
        );
        assert.isAtLeast(report.summary.wallRuntimeMs, 20);
    });

    it("waits for parallel shard cleanup before reporting an OCR session startup failure", async () => {
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
            cases: Array.from({ length: 3 }, (_, index) => ({
                id: `case-${index}`,
                image: `case-${index}.jpg`,
                imagePath: `/fixtures/case-${index}.jpg`,
                quality: "clean-scan",
                expected: { name: "Pacifism", set: "BBD", collectorNumber: "101" }
            }))
        };
        const sessions = [];
        let createSessionCalls = 0;
        let error;

        try {
            await runRegression(manifest, {
                workers: 3,
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
                    Hash: {
                        hashImage: (_imagePath, callback) => callback(null, "fresh-hash"),
                        compareHash: () => ({
                            twoBitMatches: 1,
                            fourBitMatches: 1,
                            stringCompare: 1
                        })
                    },
                    materializeFixture: async (fixture) => fixture.imagePath,
                    createOcrSession: async () => {
                        createSessionCalls += 1;
                        if (createSessionCalls === 2) {
                            throw new Error("session startup failed");
                        }
                        const session = {
                            terminateCalls: 0,
                            async terminate() {
                                this.terminateCalls += 1;
                            }
                        };
                        sessions.push(session);
                        return session;
                    }
                }
            });
        } catch (caught) {
            error = caught;
        }

        assert.instanceOf(error, Error);
        assert.equal(error.message, "session startup failed");
        assert.lengthOf(sessions, 2);
        assert.deepEqual(
            sessions.map((session) => session.terminateCalls),
            [1, 1]
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
        assert.include(markdown, "Exact print verified");
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
