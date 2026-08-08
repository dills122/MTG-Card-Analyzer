import { assert } from "chai";
import sinon from "sinon";
import { request, REQUEST_HEADERS } from "../../src/scryfall-api/http-client.mjs";

describe("scryfall-api::http-client", () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("returns the response body text on a successful request", async () => {
        sandbox.stub(global, "fetch").resolves({
            ok: true,
            status: 200,
            text: async () => '{"name":"Pacifism"}'
        });

        const body = await request({ uri: "https://api.scryfall.com/cards/named?exact=Pacifism" });

        assert.equal(body, '{"name":"Pacifism"}');
    });

    it("passes the given headers through to fetch, defaulting to REQUEST_HEADERS", async () => {
        const fetchStub = sandbox.stub(global, "fetch").resolves({
            ok: true,
            status: 200,
            text: async () => "{}"
        });

        await request({ uri: "https://api.scryfall.com/cards/named?exact=Pacifism" });

        assert.isTrue(fetchStub.calledOnce);
        assert.deepEqual(fetchStub.firstCall.args[1], { headers: REQUEST_HEADERS });
    });

    // Scryfall error bodies (e.g. {"object":"error","details":"..."}) are still valid, non-empty
    // JSON -- callers rely on this throwing so their existing try/catch treats an HTTP failure as
    // a failure instead of parsing the error body as if it were real card data.
    it("throws on a non-ok response instead of returning the error body", async () => {
        sandbox.stub(global, "fetch").resolves({
            ok: false,
            status: 404,
            text: async () => '{"object":"error","details":"not found"}'
        });

        let caughtError;
        try {
            await request({ uri: "https://api.scryfall.com/cards/named?exact=Nonexistent" });
        } catch (err) {
            caughtError = err;
        }

        assert.instanceOf(caughtError, Error);
        assert.match(caughtError.message, /HTTP 404/);
    });
});
