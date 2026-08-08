import { assert } from "chai";
import { buildProgram, main } from "../../scripts/import-scryfall-fixtures.mjs";

describe("import-scryfall-fixtures CLI", () => {
    it("parses repeated set and existing-manifest options", () => {
        const options = buildProgram()
            .exitOverride()
            .parse([
                "node",
                "import-scryfall-fixtures.mjs",
                "--set",
                "fin,dsk",
                "--set",
                "tdm",
                "--count",
                "6",
                "--existing-manifest",
                "first.json",
                "--existing-manifest",
                "second.json",
                "--dry-run"
            ])
            .opts();

        assert.deepEqual(options.set, ["fin,dsk", "tdm"]);
        assert.equal(options.count, "6");
        assert.deepEqual(options.existingManifest, ["first.json", "second.json"]);
        assert.isTrue(options.dryRun);
    });

    it("maps CLI options to the importer and reports selected cards", async () => {
        let received;
        const output = [];

        const result = await main(
            [
                "node",
                "import-scryfall-fixtures.mjs",
                "--released-after",
                "2025-01-01",
                "--released-before",
                "2025-06-30",
                "--count",
                "2"
            ],
            {
                importer: async (options) => {
                    received = options;
                    return {
                        added: [
                            {
                                name: "Card One",
                                set: "ONE",
                                collectorNumber: "1",
                                scryfallId: "one"
                            },
                            {
                                name: "Card Two",
                                set: "TWO",
                                collectorNumber: "2",
                                scryfallId: "two"
                            }
                        ],
                        excludedExisting: 3,
                        skippedUnprintable: 1,
                        dryRun: false
                    };
                },
                writeLine: (line) => output.push(line)
            }
        );

        assert.deepInclude(received, {
            sets: [],
            releasedAfter: "2025-01-01",
            releasedBefore: "2025-06-30",
            count: "2",
            dryRun: false
        });
        assert.strictEqual(result.added.length, 2);
        assert.include(output[0], "Imported 2 fixture(s)");
        assert.include(output.join("\n"), "ONE/1 Card One");
        assert.include(output.join("\n"), "Excluded existing prints: 3");
    });
});
