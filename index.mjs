import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import processorModule from "./src/processor/index.mjs";
import { getConfig, KNOWN_STORAGE_ADAPTERS } from "./src/config/index.mjs";
import storage from "./src/storage/index.mjs";

const { Processor } = processorModule;
const KNOWN_COMMANDS = ["scan", "log"];

function buildCli(argv) {
    const program = new Command();
    const parsed = {
        command: "",
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
        .option(
            "--no-local-cache",
            "Disable the local nedb cache (hash cache + ops log; names dictionary is unaffected)"
        )
        .action((filePath, options, command) => {
            parsed.command = "scan";
            parsed.filePath = filePath;
            parsed.flags = options || {};
            parsed.flags._localCacheExplicit = command.getOptionValueSource("localCache") === "cli";
        });

    const logCommand = program.command("log").description("Inspect the local operations log");

    logCommand
        .command("dump")
        .description("Print recent operation log entries")
        .option("--limit <n>", "Max entries to show", "50")
        .option("--since <date>", "Only entries at/after this ISO date")
        .option("--format <fmt>", "json|table", "table")
        .option("--config <path>", "Path to a JSON config file")
        .action((options) => {
            parsed.command = "log-dump";
            parsed.flags = options || {};
        });

    logCommand
        .command("stats")
        .description("Print aggregate stats over the operations log")
        .option("--config <path>", "Path to a JSON config file")
        .action((options) => {
            parsed.command = "log-stats";
            parsed.flags = options || {};
        });

    program.addHelpText(
        "after",
        `
Examples:
  $ scan ./img-path --query
  $ scan ./img-path --storage-adapter rds
  $ scan ./img-path --card-names-db ./data --config ./mtg.config.json
  $ scan ./img-path --no-local-cache
  $ log dump --limit 20
  $ log stats
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

// Applies CLI-flag config overrides and bridges them into process.env so the rest of the
// pipeline -- which resolves config lazily on first DB use -- picks them up. Also validates
// early (bad --storage-adapter fails fast here instead of deep in the pipeline).
function applyConfigOverrides(flags, logger) {
    try {
        const config = getConfig({
            storageAdapter: flags.storageAdapter,
            cardNamesDbPath: flags.cardNamesDb,
            cardHashDbPath: flags.cardHashDb,
            configPath: flags.config,
            localCacheEnabled: flags._localCacheExplicit ? flags.localCache : undefined
        });
        process.env.STORAGE_ADAPTER = config.storageAdapter;
        process.env.LOCAL_CACHE_ENABLED = String(config.localCacheEnabled);
        if (config.cardNamesDbPath) {
            process.env.CARD_NAMES_DB_PATH = config.cardNamesDbPath;
        }
        if (config.cardHashDbPath) {
            process.env.CARD_HASH_DB_PATH = config.cardHashDbPath;
        }
        return null;
    } catch (err) {
        logger.log(err?.message || String(err));
        return err;
    }
}

function formatOperationsTable(entries) {
    if (!entries.length) {
        return "No operations logged yet.";
    }
    const rows = entries.map((entry) => ({
        loggedAt: entry.loggedAt instanceof Date ? entry.loggedAt.toISOString() : entry.loggedAt,
        decision: entry.decision,
        filePath: entry.filePath,
        error: entry.error || ""
    }));
    const widths = ["loggedAt", "decision", "filePath", "error"].reduce((acc, key) => {
        acc[key] = Math.max(key.length, ...rows.map((row) => String(row[key] ?? "").length));
        return acc;
    }, {});
    const line = (row) =>
        ["loggedAt", "decision", "filePath", "error"]
            .map((key) => String(row[key] ?? "").padEnd(widths[key]))
            .join("  ");
    const header = {
        loggedAt: "loggedAt",
        decision: "decision",
        filePath: "filePath",
        error: "error"
    };
    return [line(header), ...rows.map(line)].join("\n");
}

async function runLogDump(flags, logger) {
    const err = applyConfigOverrides(flags, logger);
    if (err) {
        return 1;
    }
    const entries = await new Promise((resolve, reject) => {
        storage.log.dump({ limit: Number(flags.limit) || 50, since: flags.since }, (e, docs) =>
            e ? reject(e) : resolve(docs || [])
        );
    });
    if (flags.format === "json") {
        logger.log(JSON.stringify(entries, null, 2));
    } else {
        logger.log(formatOperationsTable(entries));
    }
    return 0;
}

async function runLogStats(flags, logger) {
    const err = applyConfigOverrides(flags, logger);
    if (err) {
        return 1;
    }
    const stats = await new Promise((resolve, reject) => {
        storage.log.stats((e, s) => (e ? reject(e) : resolve(s)));
    });
    logger.log(JSON.stringify(stats, null, 2));
    return 0;
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

    const normalizedArgv = KNOWN_COMMANDS.includes(argv[0]) ? argv : ["scan", ...argv];

    const cli = await commanderFactory(normalizedArgv);
    const flags = cli.flags || {};

    if (cli.helpRequested) {
        logger.log("Try running --help for more info");
        return;
    }

    if (cli.command === "log-dump") {
        exit(await runLogDump(flags, logger));
        return;
    }

    if (cli.command === "log-stats") {
        exit(await runLogStats(flags, logger));
        return;
    }

    const filePath = cli.filePath;
    if (!filePath) {
        logger.log("Try running --help for more info");
        return;
    }

    try {
        await ensureFileAccessible(fsAccess, filePath);
    } catch (err) {
        logger.log(err?.message || String(err));
        return;
    }

    const configErr = applyConfigOverrides(flags, logger);
    if (configErr) {
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

export { buildCli };

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    run().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
