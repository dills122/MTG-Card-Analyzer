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
                extract: (callback) => callback(null, type === "name" ? titleResults : rulesResults)
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
            ["name", "rules-name"]
        );
        assert.equal(MatchName.create.secondCall.args[0].cleanText, titleResults.cleanText);
        assert.equal(MatchName.create.secondCall.args[0].supplementalText, rulesResults.dirtyText);
        assert.equal(result.matches[0].name, "Yuna, Hope of Spira");
        assert.equal(result.supplementalExtractionResults, rulesResults);
    });
});
