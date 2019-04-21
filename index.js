(() => {
    const argv = require('yargs')
        .usage('Usage $0 <cmd> [options]')
        .command('scan <filepath>', 'scan a card')
        .help()
        .argv;
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
        testFiles.forEach((item, index) => {
            console.log(`Checking Image ${item} at index ${index}`);
            resize.GetImageSnippet(item, 'name').then((imgBuffer) => {
                textExtraction.ScanImage(imgBuffer, (name, instance) => {
                    MatchName(name).then((matches) => {
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
    } else {
        console.log('Try running --help for more info');
    }
})();