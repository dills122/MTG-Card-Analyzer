import assert from "assert";
import { expect, assert as chaiAssert } from "chai";
import sinon from "sinon";
import matchName from "../../src/fuzzy-matching/match-name.mjs";

const { create, dependencies } = matchName;

describe("FuzzyMatching::", () => {
    let sandbox = {};
    let stubs = {};

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        stubs.BulkNamesStub = sandbox.stub(dependencies, "GetNames").resolves([
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
            },
            {
                name: "Thought Reflection"
            },
            {
                name: "Boon Reflection"
            },
            {
                name: "Wound Reflection"
            },
            {
                name: "Pure Reflection"
            },
            {
                name: "Mana Reflection"
            },
            {
                name: "Rage Reflection"
            },
            {
                name: "Yuna, Hope of Spira"
            },
            {
                name: "Vivi Ornitier"
            }
        ]);
    });
    afterEach(() => {
        sinon.restore();
        stubs.BulkNamesStub.restore();
    });
    describe("NameMatching::", () => {
        it("Should return a high probability match", async () => {
            let name = "AdantoVanguard";
            const matches = await create({
                cleanText: name
            }).match();
            console.log(matches);
            let [first] = matches;
            assert.equal(stubs.BulkNamesStub.callCount, 1);
            expect(matches).to.be.an("array");
            assert.equal(first.name, "Adanto Vanguard");
            chaiAssert.isObject(first);
            chaiAssert.isAtMost(Object.keys(first).length, 2);
            chaiAssert.isAtLeast(first.percentage, 0.85);
            chaiAssert.isAtLeast(matches.length, 1);
        });

        it("Should return no match due to low probability", async () => {
            let name = "Coat Vangsduardsadfasd";
            const matches = await create({
                cleanText: name
            }).match();
            console.log(matches);
            assert.equal(stubs.BulkNamesStub.callCount, 1);
            chaiAssert.isArray(matches);
            assert.equal(matches.length, 0);
        });

        it("should not match an empty OCR result", async () => {
            const matches = await create({ cleanText: "" }).match();
            assert.equal(stubs.BulkNamesStub.callCount, 0);
            chaiAssert.isArray(matches);
            assert.equal(matches.length, 0);
        });

        it("should narrow name-style families to the strongest first-token match", async () => {
            const matches = await create({
                cleanText: "Thought Reflection"
            }).match();
            assert.equal(stubs.BulkNamesStub.callCount, 1);
            chaiAssert.isArray(matches);
            chaiAssert.isAtLeast(matches.length, 1);
            assert.equal(matches[0].name, "Thought Reflection");
            assert.notEqual(matches[0].name, "Boon Reflection");
            chaiAssert.isBelow(matches.length, 4);
        });

        it("should still narrow when OCR trims first token (THOU REFLECTION)", async () => {
            const matches = await create({
                cleanText: "THOU REFLECTION"
            }).match();
            assert.equal(stubs.BulkNamesStub.callCount, 1);
            chaiAssert.isArray(matches);
            chaiAssert.isAtLeast(matches.length, 1);
            assert.equal(matches[0].name, "Thought Reflection");
            chaiAssert.isBelow(matches.length, 3);
        });

        it("should recover a showcase name from title and rules-text OCR evidence", async () => {
            const matches = await create({
                cleanText: "NGLFLOPE OF SPIN",
                supplementalText: `~ Leg’endarfi Creajing; Humfinwm
During your grn, Yuria9 and enchantment
creatures you control have lifelink and ward
At the beginning of your end step, return up to one target enchantment`
            }).match();

            assert.equal(stubs.BulkNamesStub.callCount, 1);
            assert.equal(matches[0]?.name, "Yuna, Hope of Spira");
            chaiAssert.isAtLeast(matches[0]?.percentage || 0, 0.7);
        });

        it("should use an exact repeated rules-text name when the title OCR is unreadable", async () => {
            const matches = await create({
                cleanText: "WIQMTLFER",
                supplementalText: `Add X mana in any combination, where X is Vivi Ornitier’s power.
Whenever you cast a creature spell, put a counter on Vivi Ornitier.`
            }).match();

            assert.equal(stubs.BulkNamesStub.callCount, 1);
            assert.equal(matches[0]?.name, "Vivi Ornitier");
            chaiAssert.isAtLeast(matches[0]?.percentage || 0, 0.7);
        });

        it("should recover an exact repeated rules-text name when title OCR is empty", async () => {
            const matches = await create({
                cleanText: "",
                supplementalText:
                    "Where X is Vivi Ornitier’s power. Put a counter on Vivi Ornitier."
            }).match();

            assert.equal(stubs.BulkNamesStub.callCount, 1);
            assert.equal(matches[0]?.name, "Vivi Ornitier");
        });
    });
});
