import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import processorModule from "./src/processor/index.mjs";
import {
    getConfig,
    getConfigWithSources,
    resolveConfigWriteTarget,
    writeConfigValue,
    KNOWN_STORAGE_ADAPTERS
} from "./src/config/index.mjs";
import storage from "./src/storage/index.mjs";
import migrate from "./src/migrate/nedb-to-rds.mjs";
import diagnostics from "./src/diagnostics/index.mjs";
import { textExtraction } from "./src/image-analysis/index.mjs";

const { Processor } = processorModule;
const KNOWN_COMMANDS = ["scan", "log", "migrate", "collection", "diagnostics", "config"];
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
        .option(
            "-q, --query",
            "Enable DB writes for this run (overrides config; default false, see --no-query / QUERYING_ENABLED / queryingEnabled)"
        )
        .option("--no-query", "Disable DB writes for this run (overrides config)")
        .option(
            "-p, --pretty",
            "Pretty logging for this run (overrides config; default true, see --no-pretty / PRETTY_LOGGING / prettyLogging)"
        )
        .option("--no-pretty", "Plain (non-pretty) logging for this run (overrides config)")
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
        .option(
            "--enable-collection",
            "Enable the opt-in collection/needs-attention tracking module for this run (off by default; --query alone is not enough)",
            false
        )
        .option(
            "--debug",
            "Capture fuller detail in the ops log for this scan (set verification links, etc) -- see `diagnostics`",
            false
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

    program
        .command("diagnostics")
        .description(
            "Print an environment + recent-activity bundle for troubleshooting or filing a bug report"
        )
        .option("--limit <n>", "Recent ops-log entries to include", "20")
        .option("--with-mysql", "Also check the MySQL connection (rds storage adapter)", false)
        .option("--config <path>", "Path to a JSON config file")
        .action((options) => {
            parsed.command = "diagnostics";
            parsed.flags = options || {};
        });

    const configCommand = program
        .command("config")
        .description(
            "View or change settings in the JSON config file (see mtg.config.example.json)"
        );

    configCommand
        .command("list")
        .description("Show every known setting: resolved value and where it came from")
        .option("--config <path>", "Path to a JSON config file")
        .action((options) => {
            parsed.command = "config-list";
            parsed.flags = options || {};
        });

    configCommand
        .command("get")
        .description("Print one setting's resolved value")
        .argument("<key>")
        .option("--config <path>", "Path to a JSON config file")
        .action((key, options) => {
            parsed.command = "config-get";
            parsed.flags = { key, ...options };
        });

    configCommand
        .command("set")
        .description("Persist a setting into the config file (validated before writing)")
        .argument("<key>")
        .argument("<value>")
        .option(
            "--config <path>",
            "Path to a JSON config file to write to (default: whichever file is already active, or a new ./mtg.config.json)"
        )
        .action((key, value, options) => {
            parsed.command = "config-set";
            parsed.flags = { key, value, ...options };
        });

    program.addHelpText(
        "after",
        `
Examples:
  $ scan ./img-path --query
  $ scan ./img-path --no-query
  $ scan ./img-path --no-pretty
  $ scan ./img-path --storage-adapter rds
  $ scan ./img-path --card-names-db ./data --config ./mtg.config.json
  $ scan ./img-path --no-local-cache
  $ scan ./img-path --query --enable-collection
  $ scan ./img-path --debug
  $ log dump --limit 20
  $ log stats
  $ migrate --to rds --dry-run
  $ migrate --to rds
  $ collection update "Pacifism" M20 --quantity 3
  $ collection remove "Pacifism" M20
  $ diagnostics
  $ config list
  $ config get storageAdapter
  $ config set queryingEnabled true
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

// Applies CLI-flag config overrides and bridges them into process.env so the rest of the
// pipeline -- which resolves config lazily on first DB use -- picks them up. Also validates
// early (bad --storage-adapter fails fast here instead of deep in the pipeline). Returns the
// resolved config on success (callers that need a value, like collectionEnabled/debugLogging,
// don't have to re-resolve it) or null on error (already logged).
function applyConfigOverrides(flags, logger) {
    try {
        const config = getConfig({
            storageAdapter: flags.storageAdapter,
            cardNamesDbPath: flags.cardNamesDb,
            cardHashDbPath: flags.cardHashDb,
            configPath: flags.config,
            localCacheEnabled: flags._localCacheExplicit ? flags.localCache : undefined,
            collectionEnabled: flags.enableCollection || undefined,
            debugLogging: flags.debug || undefined,
            // flags.query / flags.pretty are tri-state (undefined/true/false): commander
            // leaves them undefined unless the user explicitly passes --query/--no-query or
            // --pretty/--no-pretty, so an absent flag naturally falls through to config
            // file/env/default instead of clobbering it.
            queryingEnabled: flags.query,
            prettyLogging: flags.pretty
        });
        process.env.STORAGE_ADAPTER = config.storageAdapter;
        process.env.LOCAL_CACHE_ENABLED = String(config.localCacheEnabled);
        process.env.COLLECTION_ENABLED = String(config.collectionEnabled);
        process.env.DEBUG_LOGGING = String(config.debugLogging);
        process.env.QUERYING_ENABLED = String(config.queryingEnabled);
        process.env.PRETTY_LOGGING = String(config.prettyLogging);
        if (config.cardNamesDbPath) {
            process.env.CARD_NAMES_DB_PATH = config.cardNamesDbPath;
        }
        if (config.cardHashDbPath) {
            process.env.CARD_HASH_DB_PATH = config.cardHashDbPath;
        }
        return config;
    } catch (err) {
        logger.log(err?.message || String(err));
        return null;
    }
}

// Wraps a run* handler with the "resolve config or bail with exit code 1" preamble every
// config-driven subcommand needs. Not used by runMigrate: its --to validation has to run
// before config resolution (and the process.env side effects that come with it), so it keeps
// the check inline instead.
function withConfig(handler) {
    return async (flags, logger, ...rest) => {
        const config = applyConfigOverrides(flags, logger);
        if (!config) {
            return 1;
        }
        return handler(config, flags, logger, ...rest);
    };
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

const runLogDump = withConfig(async (config, flags, logger) => {
    const entries =
        (await storage.log.dump({ limit: Number(flags.limit) || 50, since: flags.since })) || [];
    if (flags.format === "json") {
        logger.log(JSON.stringify(entries, null, 2));
    } else {
        logger.log(formatOperationsTable(entries));
    }
    return 0;
});

const runLogStats = withConfig(async (config, flags, logger) => {
    const stats = await storage.log.stats();
    logger.log(JSON.stringify(stats, null, 2));
    return 0;
});

async function runMigrate(flags, logger, migrateFn) {
    if (flags.to !== "rds") {
        logger.log(
            `Unsupported migration target "${flags.to}". Currently only "rds" is supported (nedb -> rds).`
        );
        return 1;
    }
    const config = applyConfigOverrides(flags, logger);
    if (!config) {
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

const runCollectionUpdate = withConfig(async (config, flags, logger) => {
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
});

const runCollectionRemove = withConfig(async (config, flags, logger) => {
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
});

const runDiagnostics = withConfig(async (config, flags, logger, diagnosticsFn) => {
    try {
        const bundle = await diagnosticsFn({
            limit: Number(flags.limit) || 20,
            withMysql: Boolean(flags.withMysql)
        });
        logger.log(JSON.stringify(bundle, null, 2));
        return bundle.environment.requiredFailures > 0 ? 1 : 0;
    } catch (err) {
        logger.log(err?.message || String(err));
        return 1;
    }
});

function runConfigList(flags, logger) {
    const { config, sources } = getConfigWithSources({ configPath: flags.config });
    const rows = Object.keys(sources).reduce((acc, key) => {
        acc[key] = { value: config[key], source: sources[key] };
        return acc;
    }, {});
    logger.log(JSON.stringify(rows, null, 2));
    return 0;
}

function runConfigGet(flags, logger) {
    const config = getConfig({ configPath: flags.config });
    if (!(flags.key in config)) {
        logger.log(`Unknown config key "${flags.key}".`);
        return 1;
    }
    logger.log(JSON.stringify(config[flags.key]));
    return 0;
}

function runConfigSet(flags, logger) {
    try {
        const targetPath = resolveConfigWriteTarget(flags.config);
        const result = writeConfigValue(targetPath, flags.key, flags.value);
        logger.log(`Set ${result.key} = ${JSON.stringify(result.value)} in ${result.filePath}`);
        return 0;
    } catch (err) {
        logger.log(err?.message || String(err));
        return 1;
    }
}

export async function run(options = {}) {
    const {
        argv = process.argv.slice(2),
        commanderFactory = buildCli,
        fsAccess = access,
        processorFactory = Processor.create,
        ocrShutdown = textExtraction.ShutDown,
        migrateFn = migrate.migrateNedbToRds,
        diagnosticsFn = diagnostics.gatherDiagnostics,
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

    if (cli.command === "diagnostics") {
        exit(await runDiagnostics(flags, logger, diagnosticsFn));
        return;
    }

    if (cli.command === "config-list") {
        exit(runConfigList(flags, logger));
        return;
    }

    if (cli.command === "config-get") {
        exit(runConfigGet(flags, logger));
        return;
    }

    if (cli.command === "config-set") {
        exit(runConfigSet(flags, logger));
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

    const config = applyConfigOverrides(flags, logger);
    if (!config) {
        return;
    }

    const processor = processorFactory({
        filePath,
        queryingEnabled: config.queryingEnabled,
        collectionEnabled: config.collectionEnabled,
        debugLogging: config.debugLogging,
        isPretty: config.prettyLogging
    });

    let exitCode;
    try {
        await processor.execute();
        exitCode = 0;
    } catch (err) {
        logger.log(err);
        exitCode = 1;
    }
    try {
        await ocrShutdown();
    } catch (err) {
        logger.log(err);
        exitCode = 1;
    }
    exit(exitCode);
}

export { buildCli };

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    run().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
