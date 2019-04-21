const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const assert = require('assert');
const {
    Match,
    dependencies
} = require('../../src/fuzzy-matching/match-name');
const db = require('../../src/db-local/index');


describe('FuzzyMatching::', () => {
    let sandbox = {};
    let stubs = {};
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        stubs.BulkNamesStub = sandbox.stub(dependencies, "GetNames").returns([{
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
                "name": "Gangrenous Zombies"
            },
            {
                "name": "Sarkhan Vol"
            },
            {
                "name": "Darkness"
            },
            {
                "name": "Commandeer"
            },
            {
                "name": "Carrion Beetles"
            },
            {
                "name": "Drag Down"
            },
            {
                "name": "Swirling Sandstorm"
            },
            {
                "name": "Diving Griffin"
            },
            {
                "name": "Copperhoof Vorrac"
            },
            {
                "name": "Lawless Broker"
            },
            {
                "name": "Dark Supplicant"
            },
            {
                "name": "Weldfast Monitor"
            },
            {
                "name": "Inspiring Roar"
            },
            {
                "name": "Gavony Unhallowed"
            },
            {
                "name": "Creeping Renaissance"
            },
            {
                "name": "Coat of Arms"
            },
            {
                "name": "Mobilized District"
            },
            {
                "name": "Emberhorn Minotaur"
            },
            {
                "name": "Well of Life"
            },
            {
                "name": "Juvenile Gloomwidow"
            },
            {
                "name": "Canopy Vista"
            },
            {
                "name": "Champion of Wits"
            },
            {
                "name": "Zephyr Falcon"
            },
            {
                "name": "Sulfurous Blast"
            },
            {
                "name": "Archfiend of Despair"
            }
        ])
    });
    afterEach(() => {
        sinon.restore();
        stubs.BulkNamesStub.restore();
    })
    describe('NameMatching::', () => {
        it('Should return a high probability match', (done) => {
            let name = 'AdantoVanguard';
            Match(name).then((matches) => {
                let [first, ...rest] = matches;
                assert.equal(stubs.BulkNamesStub.callCount, 1);
                expect(matches).to.be.an('array');
                assert.equal(first[1], 'Adanto Vanguard');
                assert.equal(first.length, 2);
                chai.assert.isAtLeast(first[0], .85);
                chai.assert.isAtLeast(matches.length, 1);
                done();
            });
        });

        it('Should return a lower probability match', (done) => {
            let name = 'Coat Vangsduardsadfasd';
            Match(name).then((matches) => {
                let [first, ...rest] = matches;
                assert.equal(stubs.BulkNamesStub.callCount, 1);
                expect(matches).to.be.an('array');
                assert.equal(first[1], 'Adanto Vanguard');
                assert.equal(first.length, 2);
                chai.assert.isAtLeast(first[0], .30);
                chai.assert.isAtLeast(matches.length, 1);
                done();
            });
        });

        it('Should return an incorrect match or no matches', (done) => {
            let name = 'Coat Vansbarnsss as E';
            Match(name).then((matches) => {
                let [first, ...rest] = matches;
                assert.equal(stubs.BulkNamesStub.callCount, 1);
                expect(matches).to.be.an('array');
                assert.notEqual(first[1], 'Adanto Vanguard');
                assert.equal(first.length, 2);
                chai.assert.isAtLeast(matches.length, 1);
                done();
            });
        });
    });
});