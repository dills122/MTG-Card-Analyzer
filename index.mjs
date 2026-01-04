import meow from "meow";
import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import processorModule from "./src/processor/index.mjs";

const { Processor } = processorModule;

const usage = `
        Usage
        $ scan <filePath>

        Options
        --query, -q  Enable DB writes (off by default)
        --pretty, -p Pretty logging (on by default)

        Examples
        $ scan .\\img-path --query
    `;

function buildCli(meowImpl, argv) {
    return meowImpl(usage, {
        importMeta: import.meta,
        argv,
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
    });
}

async function ensureFileAccessible(accessFn, filePath) {
    await accessFn(filePath);
}

async function executeProcessor(processor) {
    return new Promise((resolve, reject) => {
        processor.execute((err) => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}

export async function run(options = {}) {
    const {
        argv = process.argv.slice(2),
        meowImpl = meow,
        fsAccess = access,
        processorFactory = Processor.create,
        exit = process.exit,
        logger = console
    } = options;

    const cli = buildCli(meowImpl, argv);

    const cmd = cli.input[0] || "";
    const filePath = cli.input[1] || "";
    const flags = cli.flags || {};

    if (cli.input.length === 0) {
        logger.log("Try running --help for more info");
        return;
    }

    switch (cmd) {
        case "scan": {
            try {
                await ensureFileAccessible(fsAccess, filePath);
            } catch (err) {
                logger.log(err?.message || String(err));
                return;
            }

            const queryingEnabled = Boolean(flags.q ?? flags.query);
            const prettyFlag = flags.p ?? flags.pretty;
            const processor = processorFactory({
                filePath,
                queryingEnabled,
                isPretty: prettyFlag === undefined ? true : Boolean(prettyFlag)
            });

            try {
                await executeProcessor(processor);
                exit(0);
            } catch (err) {
                logger.log(err);
                exit(1);
            }
            return;
        }
        default: {
            logger.log("Command not found");
        }
    }
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    run().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
