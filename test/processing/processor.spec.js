const {
    assert,
    expect
} = require("chai");
const sinon = require("sinon");
const Processor = require("../../src/processor").Processor;
const ImageProcessor = require("../../src/image-processing").ImageProcessor;
const FileIO = require("../../src/file-io");
const MatchName = require("../../src/fuzzy-matching").MatchName;
const MatchProcessor = require("../../src/matcher").MatchingProcessor;
const NeedsAttention = require("../../src/models/needs-attention");
const Collection = require("../../src/models/card-collection");
const RDSCollection = require("../../src/rds").Collection;
const GetAdditionalCardInfo = require("../../src/scryfall-api").Search;

const EXTRACTED_TEXT = "Pacifism s";
const DIR = "./tmp/dir";
const FAKE_PATH = "./to/fake.img";
const NAME_BASE_64 = "YWZkZmFkc3NlcmVhZA==";
const COLLECTION_NAME = "SPA";
const COLLECTION_NAME_TWO = "SPA2";

describe("Integration::", () => {
    let sandbox = sinon.createSandbox();
    let stubs = {};
    let spies = {};
    let ImageProcessorInstance = {};
    let MatchNameInstance = {};
    let MatchProcessorInstance = {};

    beforeEach(() => {
        stubs.ImageProcessorCreateStub = sandbox.stub(ImageProcessor, "create").returns(ImageProcessorInstance);
        ImageProcessorInstance.extract = new Function();
        stubs.ImageProcessorExtractStub = sandbox.stub(ImageProcessorInstance, "extract").callsArgWith(0, null, {
            cleanText: EXTRACTED_TEXT,
            dirtyText: EXTRACTED_TEXT
        });
        stubs.CreateDirectoryStub = sandbox.stub(FileIO, "CreateDirectory").callsArgWith(0, null, DIR);
        stubs.MatchNameCreateStub = sandbox.stub(MatchName, "create").returns(MatchNameInstance);
        MatchNameInstance.Match = new Function();
        stubs.MatchNameMatchStub = sandbox.stub(MatchNameInstance, "Match").callsArgWith(0, null, [{
            name: "Pacifism",
            percentage: 100
        }]);
        stubs.MatchProcessorCreateStub = sandbox.stub(MatchProcessor, "create").returns(MatchProcessorInstance);
        MatchProcessorInstance.execute = new Function();
        stubs.MatchProcessorExecuteStub = sandbox.stub(MatchProcessorInstance, "execute").callsArgWith(0, null, [COLLECTION_NAME]); //Empty right now and will have to be a multi call oen since in async.each
        stubs.NeedsAttentionInsertStub = sandbox.stub(NeedsAttention.prototype, "Insert").returns(null);
        stubs.CollectionInsertStub = sandbox.stub(Collection.prototype, "Insert").returns(null);
        stubs.CollectionGetQtyStub = sandbox.stub(RDSCollection, "GetQuantity").callsArgWith(2, null, 2);
        stubs.GetAdditionalCardInfoStub = sandbox.stub(GetAdditionalCardInfo, "SearchByNameExact").callsArgWith(2, null, {
            "object": "card",
            "id": "31279d7c-5246-40b2-a8c7-0be4a5f24a29",
            "oracle_id": "5f5e0b10-c8cf-450c-bfd3-bcb0528ec330",
            "multiverse_ids": [466786],
            "mtgo_id": 72963,
            "arena_id": 69817,
            "tcgplayer_id": 192569,
            "name": "Pacifism",
            "lang": "en",
            "released_at": "2019-07-12",
            "uri": "https://api.scryfall.com/cards/31279d7c-5246-40b2-a8c7-0be4a5f24a29",
            "scryfall_uri": "https://scryfall.com/card/m20/32/pacifism?utm_source=api",
            "layout": "normal",
            "highres_image": true,
            "image_uris": {
                "small": "https://img.scryfall.com/cards/small/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412",
                "normal": "https://img.scryfall.com/cards/normal/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412",
                "large": "https://img.scryfall.com/cards/large/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412",
                "png": "https://img.scryfall.com/cards/png/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.png?1563898412",
                "art_crop": "https://img.scryfall.com/cards/art_crop/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412",
                "border_crop": "https://img.scryfall.com/cards/border_crop/front/3/1/31279d7c-5246-40b2-a8c7-0be4a5f24a29.jpg?1563898412"
            },
            "mana_cost": "{1}{W}",
            "cmc": 2.0,
            "type_line": "Enchantment — Aura",
            "oracle_text": "Enchant creature\nEnchanted creature can't attack or block.",
            "colors": ["W"],
            "color_identity": ["W"],
            "legalities": {
                "standard": "legal",
                "future": "legal",
                "historic": "legal",
                "pioneer": "legal",
                "modern": "legal",
                "legacy": "legal",
                "pauper": "legal",
                "vintage": "legal",
                "penny": "legal",
                "commander": "legal",
                "brawl": "legal",
                "duel": "legal",
                "oldschool": "not_legal"
            },
            "games": ["arena", "mtgo", "paper"],
            "reserved": false,
            "foil": true,
            "nonfoil": true,
            "oversized": false,
            "promo": false,
            "reprint": true,
            "variation": false,
            "set": "m20",
            "set_name": "Core Set 2020",
            "set_type": "core",
            "set_uri": "https://api.scryfall.com/sets/4a787360-9767-4f44-80b1-2405dc5e39c7",
            "set_search_uri": "https://api.scryfall.com/cards/search?order=set\u0026q=e%3Am20\u0026unique=prints",
            "scryfall_set_uri": "https://scryfall.com/sets/m20?utm_source=api",
            "rulings_uri": "https://api.scryfall.com/cards/31279d7c-5246-40b2-a8c7-0be4a5f24a29/rulings",
            "prints_search_uri": "https://api.scryfall.com/cards/search?order=released\u0026q=oracleid%3A5f5e0b10-c8cf-450c-bfd3-bcb0528ec330\u0026unique=prints",
            "collector_number": "32",
            "digital": false,
            "rarity": "common",
            "flavor_text": "\"Can't a fella get a moment's peace around here?\"",
            "card_back_id": "0aeebaf5-8c7d-4636-9e82-8c27447861f7",
            "artist": "Jesper Ejsing",
            "artist_ids": ["a5f8354a-8b51-4e59-96b2-0e3aeae4fa1d"],
            "illustration_id": "7485950b-a7ea-43a6-a50b-65dffed86673",
            "border_color": "black",
            "frame": "2015",
            "full_art": false,
            "textless": false,
            "booster": true,
            "story_spotlight": false,
            "edhrec_rank": 2680,
            "preview": {
                "source": "Alexander Hayne",
                "source_uri": "https://twitter.com/InsayneHayne/status/1141060865879416832",
                "previewed_at": "2019-06-18"
            },
            "prices": {
                "usd": "0.05",
                "usd_foil": "0.16",
                "eur": "0.05",
                "tix": "0.03"
            },
            "related_uris": {
                "gatherer": "https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=466786",
                "tcgplayer_decks": "https://decks.tcgplayer.com/magic/deck/search?contains=Pacifism\u0026page=1\u0026partner=Scryfall\u0026utm_campaign=affiliate\u0026utm_medium=scryfall\u0026utm_source=scryfall",
                "edhrec": "https://edhrec.com/route/?cc=Pacifism",
                "mtgtop8": "https://mtgtop8.com/search?MD_check=1\u0026SB_check=1\u0026cards=Pacifism"
            },
            "purchase_uris": {
                "tcgplayer": "https://shop.tcgplayer.com/product/productsearch?id=192569\u0026partner=Scryfall\u0026utm_campaign=affiliate\u0026utm_medium=scryfall\u0026utm_source=scryfall",
                "cardmarket": "https://www.cardmarket.com/en/Magic/Products/Singles/Core-2020/Pacifism?referrer=scryfall\u0026utm_campaign=card_prices\u0026utm_medium=text\u0026utm_source=scryfall",
                "cardhoarder": "https://www.cardhoarder.com/cards/72963?affiliate_id=scryfall\u0026ref=card-profile\u0026utm_campaign=affiliate\u0026utm_medium=card\u0026utm_source=scryfall"
            }
        }); //Need to mock out the desired card
        stubs.Base64Stub = sandbox.stub(Processor.dependencies, "Base64").callsArgWith(1, null, NAME_BASE_64);
    });


    afterEach(() => {
        sandbox.restore();
    });
    describe.only("Processor::", () => {

        it("Should execute happy path for a collection record", (done) => {
            let processorInstance = Processor.create({
                filePath: FAKE_PATH
            });
            processorInstance.execute((err) => {
                assert.isTrue(stubs.ImageProcessorCreateStub.calledOnce);
                assert.isTrue(stubs.ImageProcessorExtractStub.calledOnce);
                assert.isTrue(stubs.CreateDirectoryStub.calledOnce);
                assert.deepEqual(processorInstance.directory, DIR);
                assert.isTrue(stubs.MatchNameCreateStub.calledOnce);
                assert.isTrue(stubs.MatchNameMatchStub.calledOnce);
                assert.isTrue(stubs.MatchProcessorCreateStub.calledOnce);
                assert.isTrue(stubs.MatchProcessorExecuteStub.calledOnce);
                assert.isTrue(stubs.CollectionGetQtyStub.calledOnce);
                assert.isTrue(stubs.CollectionInsertStub.calledOnce);
                assert.isTrue(stubs.GetAdditionalCardInfoStub.calledOnce);
                return done(err);
            });
        });

        it("Should execute happy path for needs attention record", (done) => {
            stubs.MatchNameMatchStub.restore();
            stubs.MatchProcessorExecuteStub.restore();
            stubs.MatchNameMatchStub = sandbox.stub(MatchNameInstance, "Match").callsArgWith(0, null, [{
                name: "Pacifism",
                percentage: 90.2
            }, {
                name: "Fake",
                percentage: 89.2
            }, {
                name: "Another Fake",
                percentage: 90
            }]); 
            stubs.MatchProcessorExecuteStub = sandbox.stub(MatchProcessorInstance, "execute").callsArgWith(0, null, [COLLECTION_NAME, COLLECTION_NAME_TWO]); //Empty right now and will have to be a multi call oen since in async.each
            
            let processorInstance = Processor.create({
                filePath: FAKE_PATH
            });
            processorInstance.execute((err) => {
                assert.isTrue(stubs.CreateDirectoryStub.calledOnce);
                assert.deepEqual(processorInstance.directory, DIR);
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
    });
});