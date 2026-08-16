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
                "--layout",
                "transform,modal_dfc",
                "--style",
                "full-art",
                "--face",
                "back",
                "--count",
                "6",
                "--existing-manifest",
                "first.json",
                "--existing-manifest",
                "second.json",
                "--balanced",
                "--dry-run"
            ])
            .opts();

        assert.deepEqual(options.set, ["fin,dsk", "tdm"]);
        assert.deepEqual(options.layout, ["transform,modal_dfc"]);
        assert.deepEqual(options.style, ["full-art"]);
        assert.equal(options.face, "back");
        assert.equal(options.count, "6");
        assert.deepEqual(options.existingManifest, ["first.json", "second.json"]);
        assert.isTrue(options.balanced);
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
                "2",
                "--balanced"
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
                                scryfallId: "one",
                                colorCategory: "W",
                                primaryType: "Creature",
                                layout: "normal",
                                style: "normal",
                                rarity: "common",
                                face: "front"
                            },
                            {
                                name: "Card Two",
                                set: "TWO",
                                collectorNumber: "2",
                                scryfallId: "two",
                                colorCategory: "U",
                                primaryType: "Instant",
                                layout: "transform",
                                style: "showcase",
                                rarity: "rare",
                                face: "front"
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
            layouts: [],
            styles: [],
            face: "front",
            releasedAfter: "2025-01-01",
            releasedBefore: "2025-06-30",
            count: "2",
            balanced: true,
            dryRun: false
        });
        assert.strictEqual(result.added.length, 2);
        assert.include(output[0], "Imported 2 fixture(s)");
        assert.include(
            output.join("\n"),
            "ONE/1 Card One [W; Creature; normal; normal; common; front]"
        );
        assert.include(
            output.join("\n"),
            "Coverage: sets=2, color categories=2, types=2, layouts=2, styles=2, rarities=2"
        );
        assert.include(output.join("\n"), "Excluded existing prints: 3");
        assert.include(output.join("\n"), "Skipped cards without usable front JPEGs: 1");
    });
});
