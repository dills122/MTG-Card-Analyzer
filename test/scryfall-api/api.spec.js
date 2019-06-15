const chai = require('chai');
const sinon = require('sinon');
const assert = require('chai').assert;
const api = require('../../src/scryfall-api/searchName');
const deps = api.dependencies;

describe('Srcyfall Api::', () => {
    let json = {
        "object": "list",
        "total_cards": 445,
        "has_more": true,
        "next_page": "https://api.scryfall.com/cards/search?format=json&include_extras=false&include_multilingual=false&order=cmc&page=2&q=c%3Ared+pow%3D3&unique=cards",
        "data": [{}]
    };
    let stubs = {};
    let sandbox = sinon.createSandbox();
    beforeEach(() => {
        stubs.requestStub = sandbox.stub(deps, 'request').resolves(JSON.stringify(json));
    });
    afterEach(() => {
        sandbox.restore();
    });
    it('SearchByNameExact', (done) => {
        api.SearchByNameExact('Fake Name').then((card) => {
            assert.isTrue(stubs.requestStub.calledOnce);
            assert.strictEqual(card.object, "list");
            assert.deepStrictEqual(card, json);
            done();
        }).catch((err) => {
            done(err);
        });
        
    });
    it('SearchByNameFuzzy', (done) => {
        api.SearchByNameFuzzy('Fake Name', 'Fake % Name').then((card) => {
            assert.isTrue(stubs.requestStub.calledOnce);
            assert.strictEqual(card.object, "list");
            assert.deepStrictEqual(card, json);
            done();
        }).catch((err) => {
            done(err);
        });

    });
    it('SearchList', (done) => {
        api.SearchList('Fake Name').then((cards) => {
            let card = cards[0];
            assert.isTrue(stubs.requestStub.calledOnce);
            assert.strictEqual(cards.length, 1);
            assert.deepStrictEqual(card, {});
            assert.deepStrictEqual(cards, json.data);
            done();
        }).catch((err) => {
            done(err);
        });

    });
});