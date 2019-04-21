const chai = require('chai');
const expect = chai.expect;
const assert = require('assert');
const {
    MatchName
} = require('../../src/fuzzy-matching/index');


describe('FuzzyMatching::', () => {
    describe('NameMatching::', () => {
        it('Should return a high probability match', (done) => {
            let name = 'AdantoVanguard';
            MatchName(name).then((matches) => {
                let [first, ...rest] = matches;
                expect(matches).to.be.an('array');
                assert.equal(first[1], 'Adanto Vanguard');
                assert.equal(first.length, 2);
                chai.assert.isAtLeast(first[0], .85);
                chai.assert.isAtLeast(matches.length, 1);
                done();
            });
        });

        it('Should return a lower probability match', (done) => {
            let name = 'sAdantoVangsduardsadfasd';
            MatchName(name).then((matches) => {
                let [first, ...rest] = matches;
                expect(matches).to.be.an('array');
                assert.equal(first[1], 'Adanto Vanguard');
                assert.equal(first.length, 2);
                chai.assert.isAtLeast(first[0], .50);
                chai.assert.isAtLeast(matches.length, 1);
                done();
            });
        });

        it('Should return an incorrect match', (done) => {
            let name = 'TeadaedadVangardsse asa121s';
            MatchName(name).then((matches) => {
                let [first, ...rest] = matches;
                expect(matches).to.be.an('array');
                assert.notEqual(first[1], 'Adanto Vanguard');
                assert.equal(first.length, 2);
                chai.assert.isAtLeast(matches.length, 1);
                done();
            });
        });
    });
});