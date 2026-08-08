import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import processorModule from "./src/processor/index.mjs";
import { getConfig, KNOWN_STORAGE_ADAPTERS } from "./src/config/index.mjs";
import storage from "./src/storage/index.mjs";
import migrate from "./src/migrate/nedb-to-rds.mjs";

const { Processor } = processorModule;
const KNOWN_COMMANDS = ["scan", "log", "migrate", "collection"];
const HELP_TOKENS = ["--help", "-h", "help"];

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

    program
        .command("migrate")
        .description("Migrate local nedb collection/needs-attention data to another backend")
        .requiredOption("--to <adapter>", "Target backend (currently only: rds)")
        .option("--dry-run", "Preview what would be migrated without writing", false)
        .option(
            "--force",
            "Re-migrate collection entries that already exist on the target instead of skipping them",
            false
        )
        .option(
            "--card-names-db <path>",
            "Path (dir or .db file) for the local card names DB to migrate from"
        )
        .option("--config <path>", "Path to a JSON config file")
        .action((options) => {
            parsed.command = "migrate";
            parsed.flags = options || {};
        });

    const collectionCommand = program
        .command("collection")
        .description("Manually correct a collection entry (persistence tier)");

    collectionCommand
        .command("update")
        .description("Set a collection entry's quantity to an exact value")
        .argument("<cardName>")
        .argument("<cardSet>")
        .requiredOption("--quantity <n>", "Exact quantity to set")
        .option(
            "--storage-adapter <adapter>",
            `Storage adapter to use (${KNOWN_STORAGE_ADAPTERS.join("|")})`
        )
        .option("--config <path>", "Path to a JSON config file")
        .action((cardName, cardSet, options) => {
            parsed.command = "collection-update";
            parsed.flags = { cardName, cardSet, ...options };
        });

    collectionCommand
        .command("remove")
        .description("Delete a collection entry outright")
        .argument("<cardName>")
        .argument("<cardSet>")
        .option(
            "--storage-adapter <adapter>",
            `Storage adapter to use (${KNOWN_STORAGE_ADAPTERS.join("|")})`
        )
        .option("--config <path>", "Path to a JSON config file")
        .action((cardName, cardSet, options) => {
            parsed.command = "collection-remove";
            parsed.flags = { cardName, cardSet, ...options };
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
  $ migrate --to rds --dry-run
  $ migrate --to rds
  $ collection update "Pacifism" M20 --quantity 3
  $ collection remove "Pacifism" M20
`
    );

    try {
        program.parse(argv, { from: "user" });
    } catch (err) {
        // showHelpAfterError() + exitOverride() mean commander has already printed
        // appropriate output for every commander.* error (help text, or "error: missing
        // required argument"/"required option" + usage) -- not just the explicit --help
        // case. Swallow all of them here so run() doesn't also dump the raw
        // CommanderError/stack on top.
        if (err.code && err.code.startsWith("commander.")) {
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

async function runMigrate(flags, logger, migrateFn) {
    if (flags.to !== "rds") {
        logger.log(
            `Unsupported migration target "${flags.to}". Currently only "rds" is supported (nedb -> rds).`
        );
        return 1;
    }
    const err = applyConfigOverrides(flags, logger);
    if (err) {
        return 1;
    }
    try {
        const result = await migrateFn({
            dryRun: Boolean(flags.dryRun),
            force: Boolean(flags.force)
        });
        logger.log(JSON.stringify(result, null, 2));
        const hadErrors =
            result.collection.errors.length > 0 || result.needsAttention.errors.length > 0;
        return hadErrors ? 1 : 0;
    } catch (migrateErr) {
        logger.log(migrateErr?.message || String(migrateErr));
        return 1;
    }
}

async function runCollectionUpdate(flags, logger) {
    const err = applyConfigOverrides(flags, logger);
    if (err) {
        return 1;
    }
    const quantity = Number(flags.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
        logger.log(`--quantity must be a non-negative number, got "${flags.quantity}"`);
        return 1;
    }
    try {
        const doc = await storage.collection.setQuantity(flags.cardName, flags.cardSet, quantity);
        logger.log(JSON.stringify(doc, null, 2));
        return 0;
    } catch (updateErr) {
        logger.log(updateErr?.message || String(updateErr));
        return 1;
    }
}

async function runCollectionRemove(flags, logger) {
    const err = applyConfigOverrides(flags, logger);
    if (err) {
        return 1;
    }
    try {
        const removed = await storage.collection.remove(flags.cardName, flags.cardSet);
        if (!removed) {
            logger.log(`No collection entry for "${flags.cardName}" (${flags.cardSet})`);
            return 1;
        }
        logger.log(JSON.stringify(removed, null, 2));
        return 0;
    } catch (removeErr) {
        logger.log(removeErr?.message || String(removeErr));
        return 1;
    }
}

export async function run(options = {}) {
    const {
        argv = process.argv.slice(2),
        commanderFactory = buildCli,
        fsAccess = access,
        processorFactory = Processor.create,
        migrateFn = migrate.migrateNedbToRds,
        exit = process.exit,
        logger = console
    } = options;

    // Bare filepath args ("node index.mjs ./card.jpg") implicitly mean `scan` for backward
    // compatibility. Empty argv, --help/-h, and known commands must NOT get that prefix --
    // otherwise `node index.mjs --help` silently becomes `scan --help` and the top-level
    // help (which lists `log`/`migrate`/`collection` at all) never shows.
    const shouldPrefixScan =
        argv.length > 0 && !KNOWN_COMMANDS.includes(argv[0]) && !HELP_TOKENS.includes(argv[0]);
    const normalizedArgv = shouldPrefixScan ? ["scan", ...argv] : argv;

    const cli = await commanderFactory(normalizedArgv);
    const flags = cli.flags || {};

    if (cli.helpRequested) {
        // commander already printed the relevant help/usage/error text itself.
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

    if (cli.command === "migrate") {
        exit(await runMigrate(flags, logger, migrateFn));
        return;
    }

    if (cli.command === "collection-update") {
        exit(await runCollectionUpdate(flags, logger));
        return;
    }

    if (cli.command === "collection-remove") {
        exit(await runCollectionRemove(flags, logger));
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
