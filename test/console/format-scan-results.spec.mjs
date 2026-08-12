import { assert } from "chai";
import { formatScanResults } from "../../src/console/format-scan-results.mjs";

describe("formatScanResults", () => {
    it("shows card and set candidates without internal verification data", () => {
        const output = formatScanResults([
            {
                name: "Pacifism",
                sets: ["Core Set 2020", "Magic 2010"],
                setVerificationLinks: [
                    { setName: "Core Set 2020", scryfallUri: "https://example.test/card" }
                ]
            },
            {
                name: "Unknown Card",
                sets: []
            }
        ]);

        assert.equal(
            output,
            [
                "Scan results",
                "",
                "1. Pacifism",
                "   Sets: Core Set 2020, Magic 2010",
                "",
                "2. Unknown Card",
                "   Sets: No set match"
            ].join("\n")
        );
        assert.notInclude(output, "scryfallUri");
        assert.notInclude(output, "example.test");
    });

    it("handles an empty result list", () => {
        assert.equal(formatScanResults([]), "No scan results.");
    });

    it("distinguishes exact variants from the same set without exposing URLs", () => {
        const output = formatScanResults([
            {
                name: "Example",
                sets: ["Final Fantasy"],
                printings: [
                    {
                        printId: "fin-1",
                        setCode: "FIN",
                        collectorNumber: "1",
                        verified: true,
                        scryfallUri: "https://scryfall.com/card/fin/1/example"
                    },
                    {
                        printId: "fin-301",
                        setCode: "FIN",
                        collectorNumber: "301",
                        verified: false,
                        scryfallUri: "https://scryfall.com/card/fin/301/example"
                    }
                ]
            }
        ]);

        assert.include(output, "Printings: FIN #1 (verified), FIN #301 (unverified)");
        assert.notInclude(output, "scryfall.com");
        assert.notInclude(output, "printId");
    });
});
