import { assert } from "chai";
import sinon from "sinon";
import { createSearchApi } from "../../src/scryfall-api/search-name.mjs";
import { createCardNameApi } from "../../src/scryfall-api/get-card-name.mjs";

describe("Scryfall Api::", () => {
    let sandbox;
    let requestStub;
    let logger;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        requestStub = sandbox.stub();
        logger = {
            error: sandbox.stub()
        };
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("::searchName::", () => {
        const json = {
            object: "list",
            total_cards: 445,
            has_more: false,
            next_page:
                "https://api.scryfall.com/cards/search?format=json&include_extras=false&include_multilingual=false&order=cmc&page=2&q=c%3Ared+pow%3D3&unique=cards",
            data: [{}]
        };
        let api;

        beforeEach(() => {
            requestStub.resolves(JSON.stringify(json));
            api = createSearchApi({ request: requestStub, logger });
        });

        it("searchByNameExact", async () => {
            const card = await api.searchByNameExact("Fake Name");

            assert.isTrue(requestStub.calledOnce);
            assert.strictEqual(card.object, "list");
            assert.deepStrictEqual(card, json);
        });

        it("searchByNameFuzzy", async () => {
            const card = await api.searchByNameFuzzy("Fake Name", "Fake % Name");

            assert.isTrue(requestStub.calledOnce);
            assert.include(requestStub.firstCall.args[0].uri, "/cards/named?fuzzy=Fake%20Name");
            assert.strictEqual(card.object, "list");
            assert.deepStrictEqual(card, json);
        });

        it("searchList", async () => {
            const cards = await api.searchList("Fake Name");

            assert.isTrue(requestStub.calledOnce);
            assert.strictEqual(cards.length, 1);
            assert.deepStrictEqual(cards[0], {});
            assert.deepStrictEqual(cards, json.data);
        });

        it("searchList preserves exact print candidates across pages", async () => {
            requestStub.onFirstCall().resolves(
                JSON.stringify({
                    object: "list",
                    has_more: true,
                    next_page: "https://api.scryfall.com/cards/search?page=2&q=name%3AFake",
                    data: [{ id: "print-1" }]
                })
            );
            requestStub.onSecondCall().resolves(
                JSON.stringify({
                    object: "list",
                    has_more: false,
                    data: [{ id: "print-2" }]
                })
            );

            const cards = await api.searchList("Fake Name");

            assert.isTrue(requestStub.calledTwice);
            assert.deepEqual(
                cards.map((card) => card.id),
                ["print-1", "print-2"]
            );
            assert.equal(
                requestStub.secondCall.args[0].uri,
                "https://api.scryfall.com/cards/search?page=2&q=name%3AFake"
            );
        });

        it("rejects pagination URLs outside the Scryfall API origin", async () => {
            requestStub.resolves(
                JSON.stringify({
                    object: "list",
                    has_more: true,
                    next_page: "https://example.test/stolen",
                    data: [{ id: "print-1" }]
                })
            );

            const cards = await api.searchList("Fake Name");

            assert.deepEqual(cards, []);
            assert.isTrue(requestStub.calledOnce);
            assert.isTrue(logger.error.calledOnce);
        });

        it("searchByNameExact returns empty object when request fails", async () => {
            requestStub.rejects(new Error("network fail"));

            const card = await api.searchByNameExact("Fake Name");

            assert.isTrue(requestStub.calledOnce);
            assert.deepStrictEqual(card, {});
            assert.isTrue(logger.error.calledOnce);
        });

        it("searchList returns empty list when request fails", async () => {
            requestStub.rejects(new Error("network fail"));

            const cards = await api.searchList("Fake Name");

            assert.isTrue(requestStub.calledOnce);
            assert.deepStrictEqual(cards, []);
            assert.isTrue(logger.error.calledOnce);
        });
    });

    describe("::getCardName::", () => {
        const json = {
            object: "list",
            total_cards: 445,
            has_more: true,
            next_page:
                "https://api.scryfall.com/cards/search?format=json&include_extras=false&include_multilingual=false&order=cmc&page=2&q=c%3Ared+pow%3D3&unique=cards",
            data: ["Card", "CardTwo"]
        };

        it("returns the card-name catalog", async () => {
            requestStub.resolves(JSON.stringify(json));
            const cardNames = createCardNameApi({ request: requestStub, logger });

            const names = await cardNames.getCardNames();

            assert.isTrue(requestStub.calledOnce);
            assert.strictEqual(names[0], json.data[0]);
            assert.strictEqual(names[1], json.data[1]);
            assert.deepStrictEqual(names, json.data);
        });
    });
});
