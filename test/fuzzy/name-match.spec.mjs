import assert from "assert";
import { expect, assert as chaiAssert } from "chai";
import sinon from "sinon";
import matchName from "../../src/fuzzy-matching/match-name.js";

const { create, dependencies } = matchName;

describe("FuzzyMatching::", () => {
    let sandbox = {};
    let stubs = {};

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        stubs.BulkNamesStub = sandbox.stub(dependencies, "GetNames").callsArgWith(0, null, [
            {
                name: "Legion's Landing // Adanto, the First Fort"
            },
            {
                name: "Adanto Vanguard"
            },
            {
                name: "Shadow of Doubt"
            },
            {
                name: "Chain Lightning"
            },
            {
                name: "Gangrenous Zombies"
            },
            {
                name: "Sarkhan Vol"
            },
            {
                name: "Darkness"
            },
            {
                name: "Commandeer"
            },
            {
                name: "Carrion Beetles"
            },
            {
                name: "Drag Down"
            },
            {
                name: "Swirling Sandstorm"
            },
            {
                name: "Diving Griffin"
            },
            {
                name: "Copperhoof Vorrac"
            },
            {
                name: "Lawless Broker"
            },
            {
                name: "Dark Supplicant"
            },
            {
                name: "Weldfast Monitor"
            },
            {
                name: "Inspiring Roar"
            },
            {
                name: "Gavony Unhallowed"
            },
            {
                name: "Creeping Renaissance"
            },
            {
                name: "Coat of Arms"
            },
            {
                name: "Mobilized District"
            },
            {
                name: "Emberhorn Minotaur"
            },
            {
                name: "Well of Life"
            },
            {
                name: "Juvenile Gloomwidow"
            },
            {
                name: "Canopy Vista"
            },
            {
                name: "Champion of Wits"
            },
            {
                name: "Zephyr Falcon"
            },
            {
                name: "Sulfurous Blast"
            },
            {
                name: "Archfiend of Despair"
            }
        ]);
    });
    afterEach(() => {
        sinon.restore();
        stubs.BulkNamesStub.restore();
    });
    describe("NameMatching::", () => {
        it("Should return a high probability match", (done) => {
            let name = "AdantoVanguard";
            create({
                cleanText: name
            }).Match((err, matches) => {
                console.log(matches);
                let [first] = matches;
                assert.equal(stubs.BulkNamesStub.callCount, 1);
                expect(matches).to.be.an("array");
                assert.equal(first.name, "Adanto Vanguard");
                chaiAssert.isObject(first);
                chaiAssert.isAtMost(Object.keys(first).length, 2);
                chaiAssert.isAtLeast(first.percentage, 0.85);
                chaiAssert.isAtLeast(matches.length, 1);
                done(err);
            });
        });

        it("Should return no match due to low probability", (done) => {
            let name = "Coat Vangsduardsadfasd";
            create({
                cleanText: name
            }).Match((err, matches) => {
                console.log(matches);
                assert.equal(stubs.BulkNamesStub.callCount, 1);
                chaiAssert.isArray(matches);
                assert.equal(matches.length, 0);
                done(err);
            });
        });
    });
});
