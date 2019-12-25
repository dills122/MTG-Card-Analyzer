(() => {
    const meow = require('meow');
    const {
        promisify
    } = require('util');
    const fs = require('fs');
    const {
        Processor
    } = require('./src/processor/index');
    const newProcessor = require("./src/processor/n-processor");

    const isAccessible = promisify(fs.access);

    const cli = meow(`
        Usage
        $ scan <filePath>

        Options
        --query, -q  Disable Db Modification (true default)

        Examples
        $ scan .\\img-path --query
    `, {
        flags: {
            query: {
                type: 'boolean',
                alias: 'r',
                default: true
            },
            file: {
                type: 'boolean',
                alias: 'f',
                default: false
           },
            pretty: {
                type: 'boolean',
                alias: 'p',
                default: true
            }
        }
    });

    let cmd = cli.input[0] || '';
    let filePath = cli.input[1] || '';
    let flags = cli.flags;

    if (cli.input.length > 0) {
        switch (cmd) {
            case 'scan':
                isAccessible(filePath).then((isUnavailable) => {
                    if (!isUnavailable) {
                        let fileOutputEnabled = !!flags.f || flags.file;
                        let processor = newProcessor.create({
                            filePath: filePath,
                            queryingEnabled: !!flags.q || flags.query,
                            isPretty: !!flags.p || flags.pretty
                        });
                        processor.execute((err) => {
                            if (err) console.log(err);
                            // if (fileOutputEnabled) {
                            //     processor.generateOutput((err) => {
                            //         if (err) console.log(err)
                            //     });
                            // }
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