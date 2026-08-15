import { assert } from "chai";
import sinon from "sinon";
import { resolveCardName } from "../../src/processor/name-resolver.mjs";

describe("Name resolver::", () => {
    it("returns a title match without doing rules-text OCR", async () => {
        const ImageProcessor = {
            create: sinon.stub().returns({
                imagePath: "title.png",
                extract: (callback) =>
                    callback(null, { cleanText: "Pacifism", dirtyText: "Pacifism" })
            })
        };
        const MatchName = {
            create: sinon.stub().returns({
                match: async () => [{ name: "Pacifism", percentage: 1 }]
            })
        };

        const result = await resolveCardName({
            filePath: "card.jpg",
            directory: "tmp",
            ImageProcessor,
            MatchName
        });

        assert.equal(ImageProcessor.create.callCount, 1);
        assert.equal(ImageProcessor.create.firstCall.args[0].type, "name");
        assert.equal(result.matches[0].name, "Pacifism");
        assert.isUndefined(result.supplementalExtractionResults);
        assert.isAtLeast(result.timings.titleOcrMs, 0);
        assert.isAtLeast(result.timings.initialMatchMs, 0);
        assert.equal(result.timings.fallbackTitleOcrMs, 0);
        assert.equal(result.timings.supplementalOcrMs, 0);
        assert.equal(result.timings.totalFallbackOcrMs, 0);
    });

    it("uses rules-text evidence only after title matching fails", async () => {
        const titleResults = {
            cleanText: "NGLFLOPE OF SPIN",
            dirtyText: "NGLFLOPE OF SPIN"
        };
        const rulesResults = {
            cleanText: "YURIA",
            dirtyText: "During your turn, Yuria9 and enchantment creatures you control"
        };
        const ImageProcessor = {
            create: sinon.stub().callsFake(({ type }) => ({
                imagePath: `${type}.png`,
                extract: (callback) =>
                    callback(
                        null,
                        type === "name"
                            ? titleResults
                            : type === "rules-name"
                              ? rulesResults
                              : { cleanText: "", dirtyText: "", candidates: [] }
                    )
            }))
        };
        const firstMatcher = { match: sinon.stub().resolves([]) };
        const fallbackMatcher = {
            match: sinon.stub().resolves([{ name: "Yuna, Hope of Spira", percentage: 0.7375 }])
        };
        const MatchName = {
            create: sinon
                .stub()
                .onFirstCall()
                .returns(firstMatcher)
                .onSecondCall()
                .returns(firstMatcher)
                .onThirdCall()
                .returns(firstMatcher)
                .onCall(3)
                .returns(fallbackMatcher)
        };

        const result = await resolveCardName({
            filePath: "card.jpg",
            directory: "tmp",
            ImageProcessor,
            MatchName
        });

        assert.deepEqual(
            ImageProcessor.create.getCalls().map((call) => call.args[0].type),
            ["name", "soft-name", "rotated-name", "rules-name"]
        );
        assert.equal(MatchName.create.getCall(3).args[0].cleanText, titleResults.cleanText);
        assert.equal(MatchName.create.getCall(3).args[0].supplementalText, rulesResults.dirtyText);
        assert.equal(result.matches[0].name, "Yuna, Hope of Spira");
        assert.equal(result.supplementalExtractionResults, rulesResults);
        assert.isAtLeast(result.timings.fallbackTitleOcrMs, 0);
        assert.isAtLeast(result.timings.supplementalOcrMs, 0);
        assert.isAtLeast(result.timings.totalFallbackOcrMs, 0);
        assert.isAtLeast(result.timings.totalMatchMs, 0);
    });

    it("matches an alternate OCR line and promotes its source region", async () => {
        const titleResults = {
            cleanText: "HUMANELM",
            dirtyText: "humanelm",
            confidence: 74,
            bestVariant: { region: "name-core" },
            textCandidates: ["HUMANELM", "THUNDERSTEEL COLOSSUS"],
            candidates: [
                {
                    region: "name-core",
                    cleanText: "HUMANELM",
                    dirtyText: "humanelm",
                    confidence: 74,
                    textCandidates: ["HUMANELM"]
                },
                {
                    region: "top-band",
                    cleanText: "THUNDERSTEEL COLOSSUS",
                    dirtyText: "Thundersteel Colossus",
                    confidence: 70,
                    textCandidates: ["THUNDERSTEEL COLOSSUS"]
                }
            ]
        };
        const matcher = {
            matchedText: "THUNDERSTEEL COLOSSUS",
            match: sinon.stub().resolves([{ name: "Thundersteel Colossus", percentage: 1 }])
        };
        const MatchName = { create: sinon.stub().returns(matcher) };

        const result = await resolveCardName({
            filePath: "card.jpg",
            directory: "tmp",
            ImageProcessor: { create: sinon.stub() },
            MatchName,
            titleExtractionResults: titleResults,
            titleExtractionImagePath: "title.png"
        });

        assert.equal(result.extractionResults.cleanText, "THUNDERSTEEL COLOSSUS");
        assert.equal(result.extractionResults.bestVariant.region, "top-band");
        assert.equal(result.matches[0].name, "Thundersteel Colossus");
    });
});
