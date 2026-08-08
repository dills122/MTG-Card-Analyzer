import { assert } from "chai";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    importScryfallFixtures,
    normalizeCard,
    normalizeImportOptions
} from "../../src/regression/scryfall-fixture-importer.mjs";
import {
    buildCardSearchUrl,
    downloadImage,
    fetchCardPages
} from "../../src/scryfall-api/regression-fixtures.mjs";

describe("Scryfall regression fixture importer", () => {
    describe("normalizeImportOptions", () => {
        it("normalizes repeated and comma-separated set codes", () => {
            assert.deepEqual(normalizeImportOptions({ sets: ["fin, dsk", "FIN"], count: "4" }), {
                setCodes: ["dsk", "fin"],
                releasedAfter: undefined,
                releasedBefore: undefined,
                count: 4,
                maxPages: 20
            });
        });

        it("accepts a bounded release-date range", () => {
            assert.deepInclude(
                normalizeImportOptions({
                    sets: [],
                    releasedAfter: "2025-01-01",
                    releasedBefore: "2025-06-30",
                    count: 2
                }),
                {
                    releasedAfter: "2025-01-01",
                    releasedBefore: "2025-06-30"
                }
            );
        });

        it("rejects mixed set and release-date selection", () => {
            assert.throws(
                () =>
                    normalizeImportOptions({
                        sets: ["fin"],
                        releasedAfter: "2025-01-01",
                        count: 2
                    }),
                "Choose set codes or a release-date range, not both"
            );
        });

        it("rejects an inverted release-date range", () => {
            assert.throws(
                () =>
                    normalizeImportOptions({
                        sets: [],
                        releasedAfter: "2025-06-30",
                        releasedBefore: "2025-01-01",
                        count: 2
                    }),
                "released-after must be on or before released-before"
            );
        });

        it("rejects a calendar date that does not exist", () => {
            assert.throws(
                () =>
                    normalizeImportOptions({
                        sets: [],
                        releasedAfter: "2025-02-30",
                        count: 2
                    }),
                "released-after must use YYYY-MM-DD"
            );
        });
    });

    it("builds a newest-first unique-print search URL", () => {
        const url = new URL(
            buildCardSearchUrl({
                setCodes: ["dsk", "fin"],
                count: 2,
                maxPages: 20
            })
        );

        assert.equal(url.origin, "https://api.scryfall.com");
        assert.equal(url.pathname, "/cards/search");
        assert.equal(url.searchParams.get("q"), "game:paper lang:en (e:dsk OR e:fin)");
        assert.equal(url.searchParams.get("unique"), "prints");
        assert.equal(url.searchParams.get("order"), "released");
        assert.equal(url.searchParams.get("dir"), "desc");
    });

    describe("Scryfall HTTP boundary", () => {
        it("follows trusted pagination with request pacing", async () => {
            const requests = [];
            const waits = [];
            const responses = [
                jsonResponse({
                    object: "list",
                    data: [{ id: "one" }],
                    has_more: true,
                    next_page: "https://api.scryfall.com/cards/search?page=2&q=test"
                }),
                jsonResponse({
                    object: "list",
                    data: [{ id: "two" }],
                    has_more: false
                })
            ];

            const cards = await fetchCardPages("https://api.scryfall.com/cards/search?q=test", {
                maxPages: 5,
                fetchImpl: async (url, options) => {
                    requests.push({ url, options });
                    return responses.shift();
                },
                wait: async (milliseconds) => waits.push(milliseconds)
            });

            assert.deepEqual(cards, [{ id: "one" }, { id: "two" }]);
            assert.lengthOf(requests, 2);
            assert.equal(requests[0].options.headers.Accept, "application/json");
            assert.match(requests[0].options.headers["User-Agent"], /MTG-Card-Analyzer/);
            assert.deepEqual(waits, [125]);
        });

        it("stops pagination when enough usable cards have been collected", async () => {
            let requests = 0;
            const cards = await fetchCardPages("https://api.scryfall.com/cards/search?q=test", {
                maxPages: 5,
                fetchImpl: async () => {
                    requests += 1;
                    return jsonResponse({
                        object: "list",
                        data: [{ id: "enough" }],
                        has_more: true,
                        next_page: "https://api.scryfall.com/cards/search?page=2&q=test"
                    });
                },
                shouldStop: (collected) => collected.length >= 1,
                wait: async () => {}
            });

            assert.deepEqual(cards, [{ id: "enough" }]);
            assert.equal(requests, 1);
        });

        it("rejects an untrusted pagination URL", async () => {
            let error;
            try {
                await fetchCardPages("https://api.scryfall.com/cards/search?q=test", {
                    maxPages: 2,
                    fetchImpl: async () =>
                        jsonResponse({
                            object: "list",
                            data: [],
                            has_more: true,
                            next_page: "https://example.com/cards/search?page=2"
                        }),
                    wait: async () => {}
                });
            } catch (caught) {
                error = caught;
            }

            assert.instanceOf(error, Error);
            assert.include(error.message, "Untrusted Scryfall API URL");
        });

        it("downloads a bounded JPEG image", async () => {
            const destination = path.join(
                await mkdtemp(path.join(os.tmpdir(), "mtg-scryfall-download-")),
                "card.jpg"
            );
            try {
                await downloadImage("https://cards.scryfall.io/normal/card.jpg", destination, {
                    fetchImpl: async () =>
                        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
                            status: 200,
                            headers: { "Content-Type": "image/jpeg" }
                        })
                });
                assert.deepEqual(
                    [...new Uint8Array(await readFile(destination))],
                    [0xff, 0xd8, 0xff, 0xd9]
                );
            } finally {
                await rm(path.dirname(destination), { recursive: true, force: true });
            }
        });

        it("rejects a non-image download", async () => {
            let error;
            try {
                await downloadImage(
                    "https://cards.scryfall.io/normal/card.jpg",
                    path.join(os.tmpdir(), "must-not-write.jpg"),
                    {
                        fetchImpl: async () =>
                            new Response("not an image", {
                                status: 200,
                                headers: { "Content-Type": "text/plain" }
                            })
                    }
                );
            } catch (caught) {
                error = caught;
            }

            assert.instanceOf(error, Error);
            assert.include(error.message, "Expected JPEG image from Scryfall");
        });
    });

    it("skips malformed Scryfall card image URLs", () => {
        const malformed = card({
            id: "malformed",
            name: "Malformed",
            set: "fin",
            collector: "9"
        });
        malformed.image_uris.normal = "not a URL";

        assert.isUndefined(normalizeCard(malformed));
    });

    it("skips Scryfall cards with empty required metadata", () => {
        const malformed = card({ id: "malformed", name: "", set: "fin", collector: "9" });

        assert.isUndefined(normalizeCard(malformed));
    });

    describe("importScryfallFixtures", () => {
        let directory;

        beforeEach(async () => {
            directory = await mkdtemp(path.join(os.tmpdir(), "mtg-scryfall-import-"));
        });

        afterEach(async () => {
            await rm(directory, { recursive: true, force: true });
        });

        it("downloads new prints and appends disabled catalog and case entries", async () => {
            const manifestPath = path.join(directory, "fixtures", "manifest.json");
            const imageDirectory = path.join(directory, "test-images", "scryfall");
            await writeManifest(manifestPath, {
                version: 1,
                catalog: [existingCatalogEntry()],
                cases: [existingCaseEntry()]
            });

            const cards = [
                card({ id: "existing-id", name: "Existing", set: "old", collector: "1" }),
                card({ id: "new-id", name: "Fresh Card", set: "fin", collector: "42" })
            ];
            const downloads = [];

            const result = await importScryfallFixtures(
                {
                    manifestPath,
                    imageDirectory,
                    sets: ["fin"],
                    count: 1
                },
                {
                    fetchCardPages: async () => cards,
                    downloadImage: async (url, destination) => {
                        downloads.push({ url, destination });
                        await writeFile(destination, "image bytes");
                    }
                }
            );

            const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
            assert.equal(result.added.length, 1);
            assert.equal(result.excludedExisting, 1);
            assert.lengthOf(downloads, 1);
            assert.equal(downloads[0].url, "https://cards.scryfall.io/normal/new-id.jpg");
            assert.include(downloads[0].destination, "fin-42-fresh-card-new-id.jpg");
            assert.deepInclude(manifest.catalog[1], {
                enabled: false,
                scryfallId: "new-id",
                name: "Fresh Card",
                set: "FIN",
                setName: "Final Fantasy",
                collectorNumber: "42",
                referenceImage: "../test-images/scryfall/fin-42-fresh-card-new-id.jpg"
            });
            assert.deepInclude(manifest.cases[1], {
                enabled: false,
                id: "fin-42-fresh-card-new-id-scryfall",
                image: "../test-images/scryfall/fin-42-fresh-card-new-id.jpg",
                quality: "clean-scan"
            });
            assert.deepInclude(manifest.cases[1].expected, {
                name: "Fresh Card",
                set: "FIN",
                collectorNumber: "42"
            });
        });

        it("excludes prints listed in extra existing manifests", async () => {
            const manifestPath = path.join(directory, "manifest.json");
            const existingManifestPath = path.join(directory, "already-covered.json");
            await writeManifest(manifestPath, emptyManifest());
            await writeManifest(existingManifestPath, {
                version: 1,
                catalog: [
                    cardCatalogEntry({ id: "known-id", name: "Known", set: "fin", collector: "7" })
                ],
                cases: [existingCaseEntry()]
            });

            const result = await importScryfallFixtures(
                {
                    manifestPath,
                    imageDirectory: path.join(directory, "images"),
                    existingManifestPaths: [existingManifestPath],
                    sets: ["fin"],
                    count: 1,
                    dryRun: true
                },
                {
                    fetchCardPages: async () => [
                        card({ id: "known-id", name: "Known", set: "fin", collector: "7" }),
                        card({ id: "other-id", name: "Other", set: "fin", collector: "8" })
                    ]
                }
            );

            assert.deepEqual(
                result.added.map((entry) => entry.scryfallId),
                ["other-id"]
            );
            assert.equal(result.excludedExisting, 1);
            assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), emptyManifest());
        });

        it("fails without changing the manifest when too few new printable cards are found", async () => {
            const manifestPath = path.join(directory, "manifest.json");
            const originalManifest = {
                version: 1,
                catalog: [existingCatalogEntry()],
                cases: [existingCaseEntry()]
            };
            await writeManifest(manifestPath, originalManifest);

            let error;
            try {
                await importScryfallFixtures(
                    {
                        manifestPath,
                        imageDirectory: path.join(directory, "images"),
                        sets: ["fin"],
                        count: 2
                    },
                    {
                        fetchCardPages: async () => [
                            card({
                                id: "existing-id",
                                name: "Existing",
                                set: "old",
                                collector: "1"
                            })
                        ]
                    }
                );
            } catch (caught) {
                error = caught;
            }
            assert.instanceOf(error, Error);
            assert.include(error.message, "Found 0 new printable cards; requested 2");
            assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), originalManifest);
        });
    });
});

function card({ id, name, set, collector }) {
    return {
        id,
        name,
        lang: "en",
        digital: false,
        set,
        set_name: set === "fin" ? "Final Fantasy" : "Old Set",
        collector_number: collector,
        type_line: "Creature — Test",
        rarity: "common",
        scryfall_uri: `https://scryfall.com/card/${set}/${collector}`,
        image_uris: {
            normal: `https://cards.scryfall.io/normal/${id}.jpg`
        }
    };
}

function cardCatalogEntry({ id, name, set, collector }) {
    return {
        enabled: false,
        scryfallId: id,
        name,
        set: set.toUpperCase(),
        setName: "Set",
        collectorNumber: collector,
        typeLine: "Creature — Test",
        rarity: "common",
        referenceImage: "./existing.jpg"
    };
}

function existingCatalogEntry() {
    const entry = cardCatalogEntry({
        id: "existing-id",
        name: "Existing",
        set: "old",
        collector: "1"
    });
    delete entry.scryfallId;
    return entry;
}

function existingCaseEntry() {
    return {
        enabled: false,
        id: "existing-case",
        image: "./existing.jpg",
        quality: "clean-scan",
        expected: {
            name: "Existing",
            set: "OLD",
            collectorNumber: "1"
        }
    };
}

function emptyManifest() {
    return {
        version: 1,
        catalog: [],
        cases: []
    };
}

async function writeManifest(manifestPath, manifest) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
}

function jsonResponse(value) {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
}
