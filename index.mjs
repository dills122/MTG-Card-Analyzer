import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import processorModule from "./src/processor/index.mjs";
import { getConfig, KNOWN_STORAGE_ADAPTERS } from "./src/config/index.mjs";

const { Processor } = processorModule;

function buildCli(argv) {
    const program = new Command();
    const parsed = {
        filePath: "",
        flags: {},
        helpRequested: false
    };

    program.showHelpAfterError();
    program.showSuggestionAfterError();
    program.exitOverride();

    program
        .command("scan")
        .argument("<filePath>")
        .description("Scan an image file and process MTG card info")
        .option("-q, --query", "Enable DB writes (off by default)", false)
        .option("-p, --pretty", "Pretty logging (on by default)", true)
        .option(
            "--storage-adapter <adapter>",
            `Storage adapter to use (${KNOWN_STORAGE_ADAPTERS.join("|")})`
        )
        .option("--card-names-db <path>", "Path (dir or .db file) for the local card names DB")
        .option("--card-hash-db <path>", "Path (dir or .db file) for the local card hash cache DB")
        .option("--config <path>", "Path to a JSON config file (see mtg.config.json)")
        .action((filePath, options) => {
            parsed.filePath = filePath;
            parsed.flags = options || {};
        });

    program.addHelpText(
        "after",
        `
Examples:
  $ scan ./img-path --query
  $ scan ./img-path --storage-adapter rds
  $ scan ./img-path --card-names-db ./data --config ./mtg.config.json
`
    );

    try {
        program.parse(argv, { from: "user" });
    } catch (err) {
        if (err.code === "commander.helpDisplayed") {
            parsed.helpRequested = true;
        } else {
            throw err;
        }
    }

    return parsed;
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
        commanderFactory = buildCli,
        fsAccess = access,
        processorFactory = Processor.create,
        exit = process.exit,
        logger = console
    } = options;

    const normalizedArgv = argv[0] === "scan" ? argv : ["scan", ...argv];

    const cli = await commanderFactory(normalizedArgv);
    const filePath = cli.filePath;
    const flags = cli.flags || {};

    if (cli.helpRequested || !filePath) {
        logger.log("Try running --help for more info");
        return;
    }

    try {
        await ensureFileAccessible(fsAccess, filePath);
    } catch (err) {
        logger.log(err?.message || String(err));
        return;
    }

    // CLI flags win over env vars / config file (see src/config/index.mjs precedence).
    // getConfig() here both validates the flags early (bad --storage-adapter fails fast)
    // and resolves the config file, then we bridge the result into process.env so the
    // rest of the pipeline -- which resolves config lazily on first DB use -- picks it up.
    try {
        const config = getConfig({
            storageAdapter: flags.storageAdapter,
            cardNamesDbPath: flags.cardNamesDb,
            cardHashDbPath: flags.cardHashDb,
            configPath: flags.config
        });
        process.env.STORAGE_ADAPTER = config.storageAdapter;
        if (config.cardNamesDbPath) {
            process.env.CARD_NAMES_DB_PATH = config.cardNamesDbPath;
        }
        if (config.cardHashDbPath) {
            process.env.CARD_HASH_DB_PATH = config.cardHashDbPath;
        }
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
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    run().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
