(() => {
    const meow = require("meow");
    const { promisify } = require("util");
    const fs = require("fs");
    const { Processor } = require("./src/processor/index");

    const isAccessible = promisify(fs.access);

    const cli = meow(
        `
        Usage
        $ scan <filePath>

        Options
        --query, -q  Enable DB writes (off by default)

        Examples
        $ scan .\\img-path --query
    `,
        {
            flags: {
                query: {
                    type: "boolean",
                    alias: "q",
                    default: false
                },
                pretty: {
                    type: "boolean",
                    alias: "p",
                    default: true
                }
            }
        }
    );

    let cmd = cli.input[0] || "";
    let filePath = cli.input[1] || "";
    let flags = cli.flags;

    if (cli.input.length > 0) {
        switch (cmd) {
            case "scan":
                isAccessible(filePath).then((isUnavailable) => {
                    if (!isUnavailable) {
                        const queryingEnabled = !!flags.q || flags.query;
                        let processor = Processor.create({
                            filePath: filePath,
                            queryingEnabled,
                            isPretty: !!flags.p || flags.pretty
                        });
                        processor.execute((err) => {
                            if (err) console.log(err);
                            process.exit(0);
                        });
                    }
                });
                break;
            default:
                console.log("Command not found");
                break;
        }
    } else {
        console.log("Try running --help for more info");
    }
})();
