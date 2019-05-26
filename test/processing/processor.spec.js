//Tests needs work after finalizing processor design, stubs are not working correctly

// const chai = require('chai');
// const assert = require('assert');
// const sinon = require('sinon');
// const processor = require('../../src/processor/index');
// const ProcessResults = require('../../src/export-results/index').ProcessResults.ProcessResults;
// const path = require('path');
// const appRoot = require('app-root-path');
// const Collection = require('../../src/rds/collection');

// describe("Processor::", () => {
//     let sandbox = {};
//     let stubs = {}
//     beforeEach(() => {
//         sandbox = sinon.createSandbox();
//         stubs.BulkNamesStub = sinon.stub(processor.dependencies.MatchName.dependencies, "GetNames").returns([{
//                 name: "Legion's Landing // Adanto, the First Fort"
//             },
//             {
//                 name: "Adanto Vanguard"
//             },
//             {
//                 name: "Shadow of Doubt"
//             },
//             {
//                 name: "Chain Lightning"
//             },
//             {
//                 "name": "Gangrenous Zombies"
//             },
//             {
//                 "name": "Sarkhan Vol"
//             },
//             {
//                 "name": "Darkness"
//             },
//             {
//                 "name": "Commandeer"
//             },
//             {
//                 "name": "Carrion Beetles"
//             },
//             {
//                 "name": "Drag Down"
//             },
//             {
//                 "name": "Swirling Sandstorm"
//             },
//             {
//                 "name": "Diving Griffin"
//             },
//             {
//                 "name": "Copperhoof Vorrac"
//             },
//             {
//                 "name": "Lawless Broker"
//             },
//             {
//                 "name": "Dark Supplicant"
//             },
//             {
//                 "name": "Weldfast Monitor"
//             },
//             {
//                 "name": "Inspiring Roar"
//             },
//             {
//                 "name": "Gavony Unhallowed"
//             },
//             {
//                 "name": "Creeping Renaissance"
//             },
//             {
//                 "name": "Coat of Arms"
//             },
//             {
//                 "name": "Mobilized District"
//             },
//             {
//                 "name": "Emberhorn Minotaur"
//             },
//             {
//                 "name": "Well of Life"
//             },
//             {
//                 "name": "Juvenile Gloomwidow"
//             },
//             {
//                 "name": "Canopy Vista"
//             },
//             {
//                 "name": "Champion of Wits"
//             },
//             {
//                 "name": "Zephyr Falcon"
//             },
//             {
//                 "name": "Sulfurous Blast"
//             },
//             {
//                 "name": "Platinum Angel"
//             }
//         ]);
        
//         // stubs.InsertEntity = sinon.stub(Collection, "GetQuantity").callArg(2);
//         stubs.ProcessResultsStub = sinon.stub(ProcessResults.prototype, "_processResults").resolves([]);
//     });
//     afterEach(() => {
//         sinon.restore();
//     });
//     describe("ProcessImage::", () => {
//         it("Should process single image", (done) => {
//             const filePath = path.join(appRoot.toString(), 'src/test-images/PlatinumAngel.jpg');
//             let imgProcessor = processor.create({
//                 filePath: filePath
//             });
//             imgProcessor.execute((err) => {
//                 assert.equal(imgProcessor.filePath, filePath);
//                 chai.assert.isAbove(imgProcessor.nameMatches[0][0], .65);
//                 chai.assert.deepEqual(imgProcessor.nameMatches[0][1], 'Platinum Angel');
//                 chai.assert.isAbove(imgProcessor.typeMatches[0][0], .75);
//                 chai.assert.deepEqual(imgProcessor.typeMatches[0][1], 'Creature');
//                 done(err);
//             });
//         }).timeout(5000);
//         it("Should throw to small error", (done) => {
//             const filePath = path.join(appRoot.toString(), 'src/test-images/test-extractions/93e73461-807b-4590-9171-c3759a2576e9.jpg');
//             let imgProcessor = processor.create({
//                 filePath: filePath
//             });
//             imgProcessor.execute((err) => {
//                 //Error throwing not bubbling up
//                 assert.equal(imgProcessor.filePath, filePath);
//                 chai.assert.isNull(imgProcessor.nameMatches);
//                 assert.deepEqual(imgProcessor.typeMatches, []);
//                 done(err);
//             });
//         });
//     });
// }).timeout(10000);