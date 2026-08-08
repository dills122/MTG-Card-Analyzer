import { assert } from "chai";
import sinon from "sinon";
import api from "../../src/scryfall-api/search-name.mjs";
import cardNames from "../../src/scryfall-api/get-card-name.mjs";
const deps = api.dependencies;

describe("Srcyfall Api::", () => {
    describe("::searchName::", () => {
        let json = {
            object: "list",
            total_cards: 445,
            has_more: true,
            next_page:
                "https://api.scryfall.com/cards/search?format=json&include_extras=false&include_multilingual=false&order=cmc&page=2&q=c%3Ared+pow%3D3&unique=cards",
            data: [{}]
        };
        let stubs = {};
        let sandbox = sinon.createSandbox();
        beforeEach(() => {
            stubs.requestStub = sandbox.stub(deps, "request").resolves(JSON.stringify(json));
        });
        afterEach(() => {
            sandbox.restore();
        });
        it("SearchByNameExact", (done) => {
            api.SearchByNameExact("Fake Name")
                .then((card) => {
                    assert.isTrue(stubs.requestStub.calledOnce);
                    assert.strictEqual(card.object, "list");
                    assert.deepStrictEqual(card, json);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });
        it("SearchByNameFuzzy", (done) => {
            api.SearchByNameFuzzy("Fake Name", "Fake % Name")
                .then((card) => {
                    assert.isTrue(stubs.requestStub.calledOnce);
                    // Locks in the actual URL built -- templates.fuzzy vs templates.cardNameFuzzy
                    // silently mismatched here before, building ".../named?fuzzy=undefinedFake Name"
                    // with no test catching it since the stub resolved regardless of the URI passed.
                    assert.include(
                        stubs.requestStub.firstCall.args[0].uri,
                        "/cards/named?fuzzy=Fake%20Name"
                    );
                    assert.strictEqual(card.object, "list");
                    assert.deepStrictEqual(card, json);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });
        it("SearchList", (done) => {
            api.SearchList("Fake Name")
                .then((cards) => {
                    let card = cards[0];
                    assert.isTrue(stubs.requestStub.calledOnce);
                    assert.strictEqual(cards.length, 1);
                    assert.deepStrictEqual(card, {});
                    assert.deepStrictEqual(cards, json.data);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });

        it("SearchByNameExact returns empty object when request fails", (done) => {
            stubs.requestStub.restore();
            stubs.requestStub = sandbox.stub(deps, "request").rejects(new Error("network fail"));
            api.SearchByNameExact("Fake Name")
                .then((card) => {
                    assert.isTrue(stubs.requestStub.calledOnce);
                    assert.deepStrictEqual(card, {});
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });

        it("SearchList returns empty list when request fails", (done) => {
            stubs.requestStub.restore();
            stubs.requestStub = sandbox.stub(deps, "request").rejects(new Error("network fail"));
            api.SearchList("Fake Name")
                .then((cards) => {
                    assert.isTrue(stubs.requestStub.calledOnce);
                    assert.deepStrictEqual(cards, []);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });
    });
    describe("::getCardName::", () => {
        let json = {
            object: "list",
            total_cards: 445,
            has_more: true,
            next_page:
                "https://api.scryfall.com/cards/search?format=json&include_extras=false&include_multilingual=false&order=cmc&page=2&q=c%3Ared+pow%3D3&unique=cards",
            data: ["Card", "CardTwo"]
        };
        let stubs = {};
        let sandbox = sinon.createSandbox();
        beforeEach(() => {
            stubs.requestStub = sandbox
                .stub(cardNames.dependencies, "request")
                .resolves(JSON.stringify(json));
        });
        afterEach(() => {
            sandbox.restore();
        });
        it("SearchByNameExact", (done) => {
            cardNames
                .GetCardNames()
                .then((names) => {
                    assert.isTrue(stubs.requestStub.calledOnce);
                    assert.strictEqual(names[0], json.data[0]);
                    assert.strictEqual(names[1], json.data[1]);
                    assert.deepStrictEqual(names, json.data);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });
    });
});
