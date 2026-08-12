import { assert } from "chai";
import sinon from "sinon";
import processorModule from "../../src/processor/index.mjs";
const { Processor } = processorModule;

const EXTRACTED_TEXT = "Pacifism s";
const DIR = "./tmp/dir";
const FAKE_PATH = "./to/fake.img";
const NAME_BASE_64 = "YWZkZmFkc3NlcmVhZA==";
const COLLECTION_NAME = "SPA";
const COLLECTION_NAME_TWO = "SPA2";

describe("Integration::", () => {
    let sandbox;
    let stubs = {};
    let ImageProcessorInstance = {};
    let MatchNameInstance = {};
    let MatchProcessorInstance = {};
    let dependencies = {};

    function createProcessor(params) {
        return Processor.create({ ...params, dependencies });
    }

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        ImageProcessorInstance = { extract() {} };
        MatchNameInstance = { match() {} };
        MatchProcessorInstance = {
            executeAsync() {},
            matchResultDetails: [
                {
                    printId: "spa-1",
                    setCode: "SPA",
                    setName: COLLECTION_NAME,
                    collectorNumber: "1",
                    verified: true
                }
            ]
        };
        stubs.ImageProcessorCreateStub = sandbox.stub().returns(ImageProcessorInstance);
        ImageProcessorInstance.extract = new Function();
        stubs.ImageProcessorExtractStub = sandbox
            .stub(ImageProcessorInstance, "extract")
            .callsArgWith(0, null, {
                cleanText: EXTRACTED_TEXT,
                dirtyText: EXTRACTED_TEXT
            });
        stubs.CreateDirectoryStub = sandbox.stub().resolves(DIR);
        stubs.CleanUpFilesStub = sandbox.stub().resolves();
        stubs.MatchNameCreateStub = sandbox.stub().returns(MatchNameInstance);
        stubs.MatchNameMatchStub = sandbox.stub(MatchNameInstance, "match").resolves([
            {
                name: "Pacifism",
                percentage: 100
            }
        ]);
        stubs.MatchProcessorCreateStub = sandbox.stub().returns(MatchProcessorInstance);
        stubs.MatchProcessorExecuteStub = sandbox
            .stub(MatchProcessorInstance, "executeAsync")
            .resolves([COLLECTION_NAME]); //Empty right now and will have to be a multi call oen since in async.each
        stubs.NeedsAttentionInsertStub = sandbox.stub().resolves(null);
        stubs.CollectionInsertStub = sandbox.stub().resolves(null);
        stubs.logRecordStub = sandbox.stub().resolves();
        stubs.GetAdditionalCardInfoStub = sandbox.stub().resolves({
            object: "card",
            id: "31279d7c-5246-40b2-a8c7-0be4a5f24a29",
            oracle_id: "5f5e0b10-c8cf-450c-bfd3-bcb0528ec330",
            multiverse_ids: [466786],
            mtgo_id: 72963,
            arena_id: 69817,
            tcgplayer_id: 192569,
            name: "Pacifism",
            lang: "en",
            released_at: "2019-07-12",
            uri: "https://api.scryfall.com/cards/31279d7c-5246-40b2-a8c7-0be4a5f24a29",
            scryfall_uri: "https://scryfall.com/card/m20/32/pacifism?utm_source=api",
            layout: "normal",
            highres_image: true,
            image_uris: {
                small: "https://img.scryfall.com/cards/small/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412",
                normal: "https://img.scryfall.com/cards/normal/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412",
                large: "https://img.scryfall.com/cards/large/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412",
                png: "https://img.scryfall.com/cards/png/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.png?1563898412",
                art_crop:
                    "https://img.scryfall.com/cards/art_crop/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412",
                border_crop:
                    "https://img.scryfall.com/cards/border_crop/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412"
            },
            mana_cost: "{1}{W}",
            cmc: 2.0,
            type_line: "Enchantment — Aura",
            oracle_text: "Enchant creature\nEnchanted creature can't attack or block.",
            colors: ["W"],
            color_identity: ["W"],
            legalities: {
                standard: "legal",
                future: "legal",
                historic: "legal",
                pioneer: "legal",
                modern: "legal",
                legacy: "legal",
                pauper: "legal",
                vintage: "legal",
                penny: "legal",
                commander: "legal",
                brawl: "legal",
                duel: "legal",
                oldschool: "not_legal"
            },
            games: ["arena", "mtgo", "paper"],
            reserved: false,
            foil: true,
            nonfoil: true,
            oversized: false,
            promo: false,
            reprint: true,
            variation: false,
            set: "m20",
            set_name: "Core Set 2020",
            set_type: "core",
            set_uri: "https://api.scryfall.com/sets/4a787360-9767-4f44-80b1-2405dc5e39c7",
            set_search_uri:
                "https://api.scryfall.com/cards/search?order=set\u0026q=e%3Am20\u0026unique=prints",
            scryfall_set_uri: "https://scryfall.com/sets/m20?utm_source=api",
            rulings_uri:
                "https://api.scryfall.com/cards/31279d7c-5246-40b2-a8c7-0be4a5f24a29/rulings",
            prints_search_uri:
                "https://api.scryfall.com/cards/search?order=released\u0026q=oracleid%3A5f5e0b10-c8cf-450c-bfd3-bcb0528ec330\u0026unique=prints",
            collector_number: "32",
            digital: false,
            rarity: "common",
            flavor_text: "\"Can't a fella get a moment's peace around here?\"",
            card_back_id: "0aeebaf5-8c7d-4636-9e82-8c27447861f7",
            artist: "Jesper Ejsing",
            artist_ids: ["a5f8354a-8b51-4e59-96b2-0e3aeae4fa1d"],
            illustration_id: "7485950b-a7ea-43a6-a50b-65dffed86673",
            border_color: "black",
            frame: "2015",
            full_art: false,
            textless: false,
            booster: true,
            story_spotlight: false,
            edhrec_rank: 2680,
            preview: {
                source: "Alexander Hayne",
                source_uri: "https://twitter.com/InsayneHayne/status/1141060865879416832",
                previewed_at: "2019-06-18"
            },
            prices: {
                usd: "0.05",
                usd_foil: "0.16",
                eur: "0.05",
                tix: "0.03"
            },
            related_uris: {
                gatherer:
                    "https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=466786",
                tcgplayer_decks:
                    "https://decks.tcgplayer.com/magic/deck/search?contains=Pacifism\u0026page=1\u0026partner=Scryfall\u0026utm_campaign=affiliate\u0026utm_medium=scryfall\u0026utm_source=scryfall",
                edhrec: "https://edhrec.com/route/?cc=Pacifism",
                mtgtop8: "https://mtgtop8.com/search?MD_check=1\u0026SB_check=1\u0026cards=Pacifism"
            },
            purchase_uris: {
                tcgplayer:
                    "https://shop.tcgplayer.com/product/productsearch?id=192569\u0026partner=Scryfall\u0026utm_campaign=affiliate\u0026utm_medium=scryfall\u0026utm_source=scryfall",
                cardmarket:
                    "https://www.cardmarket.com/en/Magic/Products/Singles/Core-2020/Pacifism?referrer=scryfall\u0026utm_campaign=card_prices\u0026utm_medium=text\u0026utm_source=scryfall",
                cardhoarder:
                    "https://www.cardhoarder.com/cards/72963?affiliate_id=scryfall\u0026ref=card-profile\u0026utm_campaign=affiliate\u0026utm_medium=card\u0026utm_source=scryfall"
            }
        });
        stubs.Base64Stub = sandbox.stub().resolves(NAME_BASE_64);
        stubs.NeedsAttentionCreateStub = sandbox
            .stub()
            .returns({ insert: stubs.NeedsAttentionInsertStub });
        dependencies = {
            imageProcessor: { create: stubs.ImageProcessorCreateStub },
            fileIO: {
                createDirectory: stubs.CreateDirectoryStub,
                cleanUpFiles: stubs.CleanUpFilesStub
            },
            matchName: { create: stubs.MatchNameCreateStub },
            matchProcessor: { create: stubs.MatchProcessorCreateStub },
            needsAttention: { create: stubs.NeedsAttentionCreateStub },
            collection: {
                create: sandbox.stub().returns({ insert: stubs.CollectionInsertStub })
            },
            cardSearch: { searchByNameExact: stubs.GetAdditionalCardInfoStub },
            encodeImage: stubs.Base64Stub,
            storage: { adapterName: "nedb", log: { record: stubs.logRecordStub } }
        };
    });

    afterEach(() => {
        sandbox.restore();
    });
    describe("Processor::", () => {
        it("Should execute happy path for a collection record", (done) => {
            let processorInstance = createProcessor({
                filePath: FAKE_PATH,
                collectionEnabled: true
            });
            processorInstance.execute((err) => {
                assert.isTrue(stubs.ImageProcessorCreateStub.calledOnce);
                assert.isTrue(stubs.ImageProcessorExtractStub.calledOnce);
                assert.isTrue(stubs.CreateDirectoryStub.calledOnce);
                assert.isTrue(stubs.CleanUpFilesStub.calledOnceWithExactly(DIR));
                assert.equal(processorInstance.directory, "");
                assert.isTrue(stubs.MatchNameCreateStub.calledOnce);
                assert.isTrue(stubs.MatchNameMatchStub.calledOnce);
                assert.isTrue(stubs.MatchProcessorCreateStub.calledOnce);
                assert.deepInclude(stubs.MatchProcessorCreateStub.firstCall.args[0], {
                    queryingEnabled: true
                });
                assert.isTrue(stubs.MatchProcessorExecuteStub.calledOnce);
                assert.isTrue(stubs.CollectionInsertStub.calledOnce);
                assert.isTrue(stubs.GetAdditionalCardInfoStub.calledOnce);
                return done(err);
            });
        });

        it("Should execute happy path for needs attention record", (done) => {
            stubs.MatchNameMatchStub.restore();
            stubs.MatchProcessorExecuteStub.restore();
            stubs.MatchNameMatchStub = sandbox.stub(MatchNameInstance, "match").resolves([
                {
                    name: "Pacifism",
                    percentage: 90.2
                },
                {
                    name: "Fake",
                    percentage: 89.2
                },
                {
                    name: "Another Fake",
                    percentage: 90
                }
            ]);
            stubs.MatchProcessorExecuteStub = sandbox
                .stub(MatchProcessorInstance, "executeAsync")
                .resolves([COLLECTION_NAME, COLLECTION_NAME_TWO]); //Empty right now and will have to be a multi call oen since in async.each

            let processorInstance = createProcessor({
                filePath: FAKE_PATH,
                collectionEnabled: true
            });
            processorInstance.execute((err) => {
                assert.isTrue(stubs.CreateDirectoryStub.calledOnce);
                assert.isTrue(stubs.CleanUpFilesStub.calledOnceWithExactly(DIR));
                assert.equal(processorInstance.directory, "");
                assert.isTrue(stubs.ImageProcessorCreateStub.calledOnce);
                assert.isTrue(stubs.ImageProcessorExtractStub.calledOnce);
                assert.isTrue(stubs.MatchNameCreateStub.calledOnce);
                assert.isTrue(stubs.MatchNameMatchStub.calledOnce);
                assert.isTrue(stubs.MatchProcessorCreateStub.callCount === 3);
                assert.isTrue(stubs.MatchProcessorExecuteStub.callCount === 3);
                assert.isTrue(stubs.NeedsAttentionInsertStub.callCount === 3);
                assert.isTrue(stubs.Base64Stub.callCount === 3);
                return done(err);
            });
        });

        it("Should error out if no fuzzy match results are returned", (done) => {
            stubs.MatchNameMatchStub.restore();
            stubs.MatchNameMatchStub = sandbox.stub(MatchNameInstance, "match").resolves([]);
            let processorInstance = createProcessor({
                filePath: FAKE_PATH
            });
            processorInstance.execute((err) => {
                assert.isTrue(stubs.CreateDirectoryStub.calledOnce);
                assert.isTrue(stubs.CleanUpFilesStub.calledOnceWithExactly(DIR));
                assert.equal(processorInstance.directory, "");
                assert.equal(stubs.ImageProcessorCreateStub.callCount, 4);
                assert.equal(stubs.ImageProcessorExtractStub.callCount, 4);
                assert.deepEqual(
                    stubs.ImageProcessorCreateStub.getCalls().map((call) => call.args[0].type),
                    ["name", "soft-name", "rotated-name", "rules-name"]
                );
                assert.equal(stubs.MatchNameCreateStub.callCount, 4);
                assert.equal(stubs.MatchNameMatchStub.callCount, 4);
                assert.isTrue(err instanceof Error);
                assert.isFalse(stubs.MatchProcessorCreateStub.calledOnce);
                assert.isFalse(stubs.MatchProcessorExecuteStub.calledOnce);
                assert.isFalse(stubs.CollectionInsertStub.calledOnce);
                assert.isFalse(stubs.GetAdditionalCardInfoStub.calledOnce);
                return done();
            });
        });

        it("Should support promise execution without callback", async () => {
            let processorInstance = createProcessor({
                filePath: FAKE_PATH,
                collectionEnabled: true
            });
            await processorInstance.execute();
            assert.isTrue(stubs.CreateDirectoryStub.calledOnce);
            assert.isTrue(stubs.ImageProcessorExtractStub.calledOnce);
            assert.isTrue(stubs.MatchProcessorExecuteStub.calledOnce);
            assert.isTrue(stubs.CollectionInsertStub.calledOnce);
            assert.isTrue(stubs.CleanUpFilesStub.calledOnceWithExactly(DIR));
        });

        it("routes one name with multiple possible sets to needs attention", async () => {
            stubs.MatchProcessorExecuteStub.resolves([COLLECTION_NAME, COLLECTION_NAME_TWO]);
            MatchProcessorInstance.matchResultDetails = [
                {
                    printId: "spa-1",
                    setCode: "SPA",
                    setName: COLLECTION_NAME,
                    collectorNumber: "1",
                    verified: true
                },
                {
                    printId: "spa2-1",
                    setCode: "SPA2",
                    setName: COLLECTION_NAME_TWO,
                    collectorNumber: "1",
                    verified: true
                }
            ];
            const processorInstance = createProcessor({
                filePath: FAKE_PATH,
                queryingEnabled: true,
                collectionEnabled: true
            });

            await processorInstance.execute();

            assert.equal(processorInstance.decision, "needs-attention");
            assert.isFalse(stubs.CollectionInsertStub.called);
            assert.isFalse(stubs.GetAdditionalCardInfoStub.called);
            assert.isTrue(stubs.NeedsAttentionInsertStub.calledOnce);
            assert.deepInclude(stubs.NeedsAttentionCreateStub.firstCall.args[0], {
                cardName: "Pacifism",
                possibleSets: "SPA #1,SPA2 #1"
            });
        });

        it("routes an unverified single API candidate to needs attention", async () => {
            MatchProcessorInstance.matchResultDetails = [
                {
                    printId: "spa-1",
                    setCode: "SPA",
                    setName: COLLECTION_NAME,
                    collectorNumber: "1",
                    verified: false
                }
            ];
            const processorInstance = createProcessor({
                filePath: FAKE_PATH,
                queryingEnabled: true,
                collectionEnabled: true
            });

            await processorInstance.execute();

            assert.equal(processorInstance.decision, "needs-attention");
            assert.isFalse(stubs.CollectionInsertStub.called);
            assert.isTrue(stubs.NeedsAttentionInsertStub.calledOnce);
        });

        it("keeps an ambiguous printing result non-persistent during a dry run", async () => {
            stubs.MatchProcessorExecuteStub.resolves([COLLECTION_NAME, COLLECTION_NAME_TWO]);
            MatchProcessorInstance.matchResultDetails = [
                {
                    printId: "spa-1",
                    setCode: "SPA",
                    setName: COLLECTION_NAME,
                    collectorNumber: "1",
                    verified: true
                },
                {
                    printId: "spa2-1",
                    setCode: "SPA2",
                    setName: COLLECTION_NAME_TWO,
                    collectorNumber: "1",
                    verified: true
                }
            ];
            const processorInstance = createProcessor({
                filePath: FAKE_PATH,
                queryingEnabled: false,
                collectionEnabled: true
            });

            await processorInstance.execute();

            assert.equal(processorInstance.decision, "dry-run");
            assert.isFalse(stubs.CollectionInsertStub.called);
            assert.isFalse(stubs.NeedsAttentionInsertStub.called);
        });

        it("skips collection persistence when --query is on but the module is disabled", async () => {
            const consoleLogStub = sandbox.stub(console, "log");
            let processorInstance = createProcessor({
                filePath: FAKE_PATH,
                queryingEnabled: true,
                collectionEnabled: false
            });

            await processorInstance.execute();

            assert.equal(processorInstance.decision, "module-disabled");
            assert.isFalse(
                stubs.CollectionInsertStub.called,
                "must not persist when the module is off, even with --query"
            );
            assert.isFalse(stubs.GetAdditionalCardInfoStub.called);
            assert.isTrue(consoleLogStub.called, "still prints results, same as dry-run");
        });

        it("prints concise scan results through the injected logger", async () => {
            const output = sandbox.stub();
            const injectedLogger = {
                info: sandbox.stub(),
                warn: sandbox.stub(),
                error: sandbox.stub(),
                output
            };
            const processorInstance = createProcessor({
                filePath: FAKE_PATH,
                queryingEnabled: false,
                logger: injectedLogger
            });

            await processorInstance.execute();

            assert.isTrue(
                output.calledOnceWithExactly(
                    "Scan results\n\n1. Pacifism\n   Sets: SPA\n   Printings: SPA #1 (verified)"
                )
            );
        });

        it("Should reject promise execution on matching errors", async () => {
            stubs.MatchProcessorExecuteStub.restore();
            const expectedError = new Error("failed to match");
            stubs.MatchProcessorExecuteStub = sandbox
                .stub(MatchProcessorInstance, "executeAsync")
                .rejects(expectedError);

            let processorInstance = createProcessor({
                filePath: FAKE_PATH
            });

            let caughtError;
            try {
                await processorInstance.execute();
            } catch (err) {
                caughtError = err;
            }
            assert.equal(caughtError, expectedError);
            assert.isFalse(stubs.CollectionInsertStub.calledOnce);
            assert.isFalse(stubs.NeedsAttentionInsertStub.calledOnce);
            assert.isTrue(stubs.CleanUpFilesStub.calledOnceWithExactly(DIR));
        });

        it("awaits temporary cleanup before resolving", async () => {
            let finishCleanup;
            stubs.CleanUpFilesStub.returns(
                new Promise((resolve) => {
                    finishCleanup = resolve;
                })
            );
            const processorInstance = createProcessor({ filePath: FAKE_PATH });
            let settled = false;

            const execution = processorInstance.execute().finally(() => {
                settled = true;
            });
            while (!stubs.CleanUpFilesStub.called) {
                await new Promise((resolve) => setImmediate(resolve));
            }

            assert.isFalse(settled);
            finishCleanup();
            await execution;
            assert.isTrue(settled);
        });

        it("awaits the operations-log write before cleanup and resolution", async () => {
            let finishLogWrite;
            stubs.logRecordStub.returns(
                new Promise((resolve) => {
                    finishLogWrite = resolve;
                })
            );
            const processorInstance = createProcessor({ filePath: FAKE_PATH });
            let settled = false;

            const execution = processorInstance.execute().finally(() => {
                settled = true;
            });
            while (!stubs.logRecordStub.called) {
                await new Promise((resolve) => setImmediate(resolve));
            }

            assert.isFalse(settled);
            assert.isFalse(stubs.CleanUpFilesStub.called);
            finishLogWrite();
            await execution;
            assert.isTrue(stubs.CleanUpFilesStub.calledOnceWithExactly(DIR));
            assert.isTrue(settled);
        });

        it("does not replace the primary scan error when cleanup fails", async () => {
            const primaryError = new Error("failed to match");
            stubs.MatchProcessorExecuteStub.rejects(primaryError);
            stubs.CleanUpFilesStub.rejects(new Error("cleanup failed"));
            const error = sandbox.stub();
            const processorInstance = createProcessor({
                filePath: FAKE_PATH,
                logger: {
                    info: sandbox.stub(),
                    error,
                    output: sandbox.stub()
                }
            });

            let caughtError;
            try {
                await processorInstance.execute();
            } catch (err) {
                caughtError = err;
            }

            assert.equal(caughtError, primaryError);
            assert.isTrue(error.calledWithMatch(sinon.match(/cleanup failed/)));
        });

        it("logs only name/sets per matcher result when debugLogging is off (default)", (done) => {
            let processorInstance = createProcessor({
                filePath: FAKE_PATH
            });
            processorInstance.execute((err) => {
                assert.isTrue(stubs.logRecordStub.calledOnce);
                const loggedRecord = stubs.logRecordStub.firstCall.args[0];
                assert.isArray(loggedRecord.matcherResults);
                assert.isNotEmpty(loggedRecord.matcherResults);
                loggedRecord.matcherResults.forEach((result) => {
                    assert.hasAllKeys(result, ["name", "sets"]);
                });
                return done(err);
            });
        });

        it("logs setVerificationLinks per matcher result when debugLogging is on", (done) => {
            let processorInstance = createProcessor({
                filePath: FAKE_PATH,
                debugLogging: true
            });
            processorInstance.execute((err) => {
                assert.isTrue(stubs.logRecordStub.calledOnce);
                const loggedRecord = stubs.logRecordStub.firstCall.args[0];
                assert.isArray(loggedRecord.matcherResults);
                assert.isNotEmpty(loggedRecord.matcherResults);
                loggedRecord.matcherResults.forEach((result) => {
                    assert.hasAllKeys(result, [
                        "name",
                        "sets",
                        "printings",
                        "setVerificationLinks"
                    ]);
                });
                return done(err);
            });
        });
    });
});
