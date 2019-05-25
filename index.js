(() => {
    const argv = require('yargs')
        .usage('Usage $0 <cmd> [options]')
        .command('scan <filepath>', 'scan a card')
        .command('demo <filepath>', 'scan a card')
        .help()
        .argv;
    const {
        promisify
    } = require('util');
    const fs = require('fs');
    const {
        textExtraction
    } = require('./src/image-analysis/index');
    const {
        resize
    } = require('./src/image-processing/index');
    const {
        MatchType,
        MatchName
    } = require('./src/fuzzy-matching/index');
    const {
        Processor
    } = require('./src/processor/index');
    const {
        ProcessCard
    } = require('./src/processor/demo-processor');

    const isAccessible = promisify(fs.access);

    const testFiles = [
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\Artunement.jpg',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\MeletisCharlatan.jpg',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\MindstrabThrull.jpeg',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\QueenMarchesa.png',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\PlatinumAngel.jpg',
        'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\AdantoVanguard.png',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\AngelOfSanctions.png',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\AvariciousDragon.jpg',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\Spellseeker.png'
    ];
    if (argv._.length === 1) {
        let cmd = argv._[0];
        switch (cmd) {
            case 'fake':
                testFiles.forEach((item, index) => {
                    console.log(`Checking Image ${item} at index ${index}`);
                    resize.GetImageSnippet(item, 'name').then((imgBuffer) => {
                        textExtraction.ScanImage(imgBuffer, (name, instance) => {
                            MatchName.Match(name).then((matches) => {
                                console.log(matches);
                            }).catch(err => console.log(err));
                            resize.GetImageSnippet(item, 'type').then((imgBuffer) => {
                                textExtraction.ScanImage(imgBuffer, (type, instance) => {
                                    let matchesTwo = MatchType(type);
                                    console.log(type);
                                    console.log(matchesTwo);
                                    instance.terminate();
                                });
                            }).catch(err => {});
                        });
                    }).catch(err => {});
                });
                break;
            case 'scan':
                isAccessible(argv.filepath).then((isUnavailable) => {
                    if (!isUnavailable) {
                        let processor = Processor.create({
                            filePath: argv.filepath
                        });
                        processor.execute((err) => {
                            if (err) console.log(err);
                            processor.generateOutput((err) => {
                                if (err) console.log(err)
                            });
                        });
                    }
                });
                break;
            case 'demo':
                isAccessible(argv.filepath).then((isUnavailable) => {
                    if (!isUnavailable) {
                        ProcessCard(argv.filepath);
                    }
                });
                break;
            default:
                console.log('Command not found');
                break;
        }
    } else {
        console.log('Try running --help for more info');
    }
})();