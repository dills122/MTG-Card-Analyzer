import { expect } from "chai";
import { handleRequest } from "../../site/worker/index.mjs";

const SAMPLE_CARD = {
    id: "a7d9f095-7e20-48af-8140-5d79a311a623",
    name: "Pacifism",
    set: "bbd",
    set_name: "Battlebond",
    collector_number: "101",
    type_line: "Enchantment — Aura",
    rarity: "common",
    scryfall_uri: "https://scryfall.com/card/bbd/101/pacifism",
    image_uris: { normal: "https://cards.scryfall.io/normal/pacifism.jpg" }
};

function createDependencies(fetchImpl) {
    return {
        fetch: fetchImpl,
        randomUUID: () => "00000000-0000-4000-8000-000000000001",
        now: () => "2026-08-07T12:00:00.000Z"
    };
}

function createSubmissionRequest({ turnstileToken } = {}) {
    const form = new FormData();
    form.set(
        "image",
        new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "pacifism.jpg", {
            type: "image/jpeg"
        })
    );
    form.set("name", "Pacifism");
    form.set("setCode", "BBD");
    form.set("setName", "Battlebond");
    form.set("collectorNumber", "101");
    form.set("typeLine", "Enchantment — Aura");
    form.set("rarity", "common");
    form.set("quality", "good-photo");
    form.set("sourceMode", "manual");
    form.set("consent", "yes");
    if (turnstileToken) form.set("cf-turnstile-response", turnstileToken);
    return new Request("http://localhost/api/submissions", { method: "POST", body: form });
}

function createStorageEnvironment({ insertError } = {}) {
    const state = { puts: [], deletes: [], binds: [] };
    const env = {
        SUBMISSION_IMAGES: {
            async put(key, value, options) {
                state.puts.push({ key, value, options });
            },
            async delete(key) {
                state.deletes.push(key);
            }
        },
        SUBMISSIONS_DB: {
            prepare(sql) {
                return {
                    bind(...values) {
                        state.binds.push({ sql, values });
                        return {
                            async run() {
                                if (insertError) throw insertError;
                                return { success: true };
                            }
                        };
                    }
                };
            }
        }
    };
    return { env, state };
}

describe("test-data portal Worker", () => {
    it("returns bounded Scryfall autocomplete results with identifying headers", async () => {
        let upstreamRequest;
        const dependencies = createDependencies(async (request) => {
            upstreamRequest = request;
            return Response.json({ data: ["Pacifism", "Pacifism Array"] });
        });

        const response = await handleRequest(
            new Request("https://example.com/api/cards/autocomplete?q= paci "),
            {},
            {},
            dependencies
        );

        expect(response.status).to.equal(200);
        expect(await response.json()).to.deep.equal({ data: ["Pacifism", "Pacifism Array"] });
        expect(upstreamRequest.url).to.equal(
            "https://api.scryfall.com/cards/autocomplete?q=paci&include_extras=false"
        );
        expect(upstreamRequest.headers.get("user-agent")).to.match(/^MTG-Card-Analyzer\//);
        expect(upstreamRequest.headers.get("accept")).to.include("application/json");
    });

    it("maps Scryfall print results to the metadata contract", async () => {
        const dependencies = createDependencies(async () =>
            Response.json({ data: [SAMPLE_CARD], has_more: false })
        );

        const response = await handleRequest(
            new Request("https://example.com/api/cards/prints?name=Pacifism"),
            {},
            {},
            dependencies
        );

        expect(response.status).to.equal(200);
        expect(await response.json()).to.deep.equal({
            data: [
                {
                    id: SAMPLE_CARD.id,
                    name: "Pacifism",
                    setCode: "BBD",
                    setName: "Battlebond",
                    collectorNumber: "101",
                    typeLine: "Enchantment — Aura",
                    rarity: "common",
                    scryfallUri: SAMPLE_CARD.scryfall_uri,
                    imageUrl: SAMPLE_CARD.image_uris.normal
                }
            ]
        });
    });

    it("drops untrusted Scryfall image and provenance URLs", async () => {
        const dependencies = createDependencies(async () =>
            Response.json({
                data: [
                    {
                        ...SAMPLE_CARD,
                        scryfall_uri: "https://example.com/card",
                        image_uris: { normal: "https://example.com/tracker.jpg" }
                    }
                ]
            })
        );

        const response = await handleRequest(
            new Request("https://example.com/api/cards/prints?name=Pacifism"),
            {},
            {},
            dependencies
        );

        expect((await response.json()).data[0]).to.include({
            scryfallUri: null,
            imageUrl: null
        });
    });

    it("rejects short autocomplete queries without contacting Scryfall", async () => {
        let calls = 0;
        const dependencies = createDependencies(async () => {
            calls += 1;
            return Response.json({ data: [] });
        });

        const response = await handleRequest(
            new Request("https://example.com/api/cards/autocomplete?q=p"),
            {},
            {},
            dependencies
        );

        expect(response.status).to.equal(400);
        expect(calls).to.equal(0);
    });

    it("stores the image before inserting a pending review record", async () => {
        const { env, state } = createStorageEnvironment();

        const response = await handleRequest(
            createSubmissionRequest(),
            env,
            {},
            createDependencies(fetch)
        );

        expect(response.status).to.equal(201);
        expect(await response.json()).to.deep.equal({
            id: "00000000-0000-4000-8000-000000000001",
            status: "pending"
        });
        expect(state.puts).to.have.length(1);
        expect(state.puts[0].key).to.equal(
            "submissions/2026/08/00000000-0000-4000-8000-000000000001.jpg"
        );
        expect(state.puts[0].options.httpMetadata.contentType).to.equal("image/jpeg");
        expect(state.binds).to.have.length(1);
        expect(state.binds[0].values).to.include("pending");
    });

    it("requires a valid Turnstile token when protection is configured", async () => {
        const { env, state } = createStorageEnvironment();
        env.TURNSTILE_SECRET_KEY = "test-secret";

        const response = await handleRequest(
            createSubmissionRequest(),
            env,
            {},
            createDependencies(fetch)
        );

        expect(response.status).to.equal(400);
        expect((await response.json()).error.code).to.equal("verification_required");
        expect(state.puts).to.have.length(0);
    });

    it("fails closed when Turnstile is missing outside local development", async () => {
        const { env, state } = createStorageEnvironment();
        const request = createSubmissionRequest();

        const response = await handleRequest(
            new Request("https://example.com/api/submissions", {
                method: "POST",
                body: await request.formData()
            }),
            env,
            {},
            createDependencies(fetch)
        );

        expect(response.status).to.equal(503);
        expect((await response.json()).error.code).to.equal("verification_not_configured");
        expect(state.puts).to.have.length(0);
    });

    it("rejects files whose bytes do not match their declared image type", async () => {
        const { env, state } = createStorageEnvironment();
        const request = createSubmissionRequest();
        const form = await request.formData();
        form.set("image", new File(["plain text"], "fake.jpg", { type: "image/jpeg" }));

        const response = await handleRequest(
            new Request("http://localhost/api/submissions", { method: "POST", body: form }),
            env,
            {},
            createDependencies(fetch)
        );

        expect(response.status).to.equal(400);
        expect((await response.json()).error.fields).to.deep.equal({
            image: "Image contents do not match the selected file type."
        });
        expect(state.puts).to.have.length(0);
    });

    it("verifies Turnstile server-side before storing a protected submission", async () => {
        const { env, state } = createStorageEnvironment();
        env.TURNSTILE_SECRET_KEY = "test-secret";
        let verificationRequest;
        const dependencies = createDependencies(async (request) => {
            verificationRequest = request;
            return Response.json({ success: true, action: "fixture_submission" });
        });

        const response = await handleRequest(
            createSubmissionRequest({ turnstileToken: "verified-token" }),
            env,
            {},
            dependencies
        );

        expect(response.status).to.equal(201);
        expect(verificationRequest.url).to.equal(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify"
        );
        expect(await verificationRequest.clone().json()).to.include({
            secret: "test-secret",
            response: "verified-token"
        });
        expect(state.puts).to.have.length(1);
    });

    it("removes the R2 object when the metadata insert fails", async () => {
        const { env, state } = createStorageEnvironment({
            insertError: new Error("D1 unavailable")
        });

        const response = await handleRequest(
            createSubmissionRequest(),
            env,
            {},
            createDependencies(fetch)
        );

        expect(response.status).to.equal(503);
        expect(state.deletes).to.deep.equal([
            "submissions/2026/08/00000000-0000-4000-8000-000000000001.jpg"
        ]);
    });

    it("serves non-API requests from the static asset binding", async () => {
        const env = {
            ASSETS: {
                async fetch() {
                    return new Response("site", { headers: { "content-type": "text/html" } });
                }
            }
        };

        const response = await handleRequest(
            new Request("https://example.com/"),
            env,
            {},
            createDependencies(fetch)
        );

        expect(await response.text()).to.equal("site");
        expect(response.headers.get("content-security-policy")).to.include("default-src 'self'");
        expect(response.headers.get("x-frame-options")).to.equal("DENY");
        expect(response.headers.get("referrer-policy")).to.equal("no-referrer");
    });
});
