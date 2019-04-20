(() => {
    const argv = require('yargs')
        .usage('Usage $0 <cmd> [options]')
        .command('scan <filepath>', 'scan a card')
        .help()
        .argv;
    const {
        ScanImage
    } = require('./src/scanImage');
    const sharp = require('sharp');
    const testFiles = [
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\Artunement.jpg',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\MeletisCharlatan.jpg',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\MindstrabThrull.jpeg',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\QueenMarchesa.png',
        'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\PlatinumAngel.jpg',
        // 'E:\\GitHub\\mtg-card-analyzer\\src\\test-images\\AdantoVanguard.png'
    ];

    if (argv._.length === 1) {
        testFiles.forEach((item, index) => {
            console.log(`Checking Image ${item} at index ${index}`);
            sharp(item)
                // .resize(200, 280)
                .extract({
                    width: 300,
                    height: 80,
                    left: 20,
                    top: 25
                }).toFile('testFile.jpg').then((info) => {
                    console.log(info);
                    return ScanImage('testFile.jpg');
                }).then(() => {}).catch((err) => {
                    console.log(err);
                });

        });
    } else {
        console.log('Try running --help for more info');
    }
})();