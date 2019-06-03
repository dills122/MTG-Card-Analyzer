(() => {
    const argv = require('yargs')
        .usage('Usage $0 <cmd> [options]')
        .command('scan <filepath>', 'scan a card', (yargs) => {
            yargs.option('q', {
                alias: 'query'
            })
        })
        .help()
        .argv;
    const {
        promisify
    } = require('util');
    const fs = require('fs');
    const {
        Processor
    } = require('./src/processor/index');

    const isAccessible = promisify(fs.access);

    if (argv._.length === 1) {
        let cmd = argv._[0];
        switch (cmd) {
            case 'scan':
                isAccessible(argv.filepath).then((isUnavailable) => {
                    if (!isUnavailable) {
                        let processor = Processor.create({
                            filePath: argv.filepath,
                            queryingEnabled: !!!argv.q
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
            default:
                console.log('Command not found');
                break;
        }
    } else {
        console.log('Try running --help for more info');
    }
})();