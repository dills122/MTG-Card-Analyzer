const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const assert = require('chai').assert;

describe.only('Processor::', () => {
    let stubs = {};
    let sandbox = sinon.createSandbox();
    let filePath = '.\\src\\test-images\\AngelOfSanctions.png';
    let name = 'Name';
    beforeEach(() => {
        stubs.processResultsExecute = sandbox.stub().resolves({});
        stubs.WriteToFile = sandbox.stub().resolves('file complete');
        stubs.CreateDirectory = sandbox.stub().resolves('./Fake-dir/');
        stubs.ScanImage = sandbox.stub().callsFake((imgBuffer, cb) => cb(null, {
            cleanText: 'This is a string',
            dirtyText: 'This is 2343 a dirt 3 String'
        }));
        stubs.ShutDown = sandbox.stub().callsFake(() => console.log('Shut Down'));
        stubs.GetImageSnippetTmpFile = sandbox.stub().resolves(filePath);
        stubs.NeedsAtn = sandbox.stub().resolves();
        stubs.StringfyImagesNDAtn = sandbox.stub().resolves('0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0');
        stubs.NDAttnInsert = sandbox.stub().callsFake((arg, cb) => cb());
    });
    afterEach(() => {
        sandbox.restore();
    });
    it('Process Image file', (done) => {
        let processor = proxyquire('../../src/processor/processor', {
            '../export-results/index': {
                ProcessResults: {
                    create: () => {
                        return {
                            execute: stubs.processResultsExecute
                        }
                    }
                }
            },
            '../file-io': {
                WriteToFile: stubs.WriteToFile,
                CreateDirectory: stubs.CreateDirectory
            },
            '../image-analysis/index': {
                textExtraction: {
                    ScanImage: stubs.ScanImage,
                    ShutDown: stubs.ShutDown
                }
            },
            '../image-processing/index': {
                resize: {
                    GetImageSnippetTmpFile: stubs.GetImageSnippetTmpFile
                }
            },
            '../models/needs-attention': {
                Insert: stubs.NeedsAtn,
                '../rds/index': {
                    NDAttn : {
                        InsertEntity: stubs.NDAttnInsert,
                        './connection': {
                            '../../secure.config' : {
                                rds: {
                                    
                                }
                            }
                        }
                    }
                }
            },
            '../image-hashing/index': {
                StringfyImagesNDAtn: stubs.StringfyImagesNDAtn
            }
        });
        stubs.MatchName = sandbox.stub(processor.dependencies.MatchName, 'Match').resolves(['.90', 'CardName']);

        let processorInst = processor.create({
            filePath,
            queryingEnabled: false
        });
        processorInst.execute((err) => {
            assert.isTrue(stubs.processResultsExecute.calledOnce);
            assert.isTrue(stubs.CreateDirectory.calledOnce);
            assert.strictEqual(stubs.ScanImage.callCount, 2);
            assert.strictEqual(stubs.GetImageSnippetTmpFile.callCount, 4);
            assert.isTrue(stubs.ShutDown.calledOnce);
            done(err);
        });
    }).timeout(10000);
});