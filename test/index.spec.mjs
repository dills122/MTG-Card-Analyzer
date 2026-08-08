import { assert } from "chai";
import sinon from "sinon";
import { run, buildCli } from "../index.mjs";
import storage from "../src/storage/index.mjs";

describe("CLI::index.mjs", () => {
    let sandbox;
    let consoleLogStub;
    let processExitStub;
    let savedEnv;
    const envKeys = [
        "STORAGE_ADAPTER",
        "CARD_NAMES_DB_PATH",
        "CARD_HASH_DB_PATH",
        "LOCAL_CACHE_ENABLED"
    ];

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        consoleLogStub = sandbox.stub();
        processExitStub = sandbox.stub();
        savedEnv = {};
        envKeys.forEach((key) => {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        });
    });

    afterEach(() => {
        sandbox.restore();
        envKeys.forEach((key) => {
            if (savedEnv[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = savedEnv[key];
            }
        });
    });

    async function runCli(cliOverrides = {}, accessImpl) {
        const fakeCli = {
            filePath: "",
            flags: {},
            helpRequested: false,
            ...cliOverrides
        };
        const commanderFactory = sandbox.stub().resolves(fakeCli);
        const executeStub = sandbox.stub().callsFake((cb) => cb && cb());
        const processorCreateStub = sandbox.stub().returns({
            execute: executeStub
        });

        const fsAccessStub = accessImpl ? accessImpl : sandbox.stub().resolves();

        await run({
            argv: [],
            commanderFactory,
            fsAccess: fsAccessStub,
            processorFactory: processorCreateStub,
            exit: processExitStub,
            logger: { log: consoleLogStub }
        });

        return { commanderFactory, executeStub, processorCreateStub, fsAccessStub, fakeCli };
    }

    it("prints help when no command provided", async () => {
        await runCli();
        assert.isTrue(consoleLogStub.calledWith("Try running --help for more info"));
        assert.isFalse(processExitStub.called);
    });

    it("prints usage when help is requested", async () => {
        await runCli({ opts: () => ({ help: true }) });
        assert.isTrue(consoleLogStub.called);
        assert.isFalse(processExitStub.called);
    });

    it("invokes Processor for scan command with defaults and exits", async () => {
        const { processorCreateStub, executeStub, fsAccessStub } = await runCli({
            filePath: "./some-path.jpg",
            flags: { q: false, query: false, p: true, pretty: true }
        });

        assert.isTrue(fsAccessStub.calledWith("./some-path.jpg"));
        assert.isTrue(processorCreateStub.calledOnce);
        assert.deepInclude(processorCreateStub.firstCall.args[0], {
            filePath: "./some-path.jpg",
            queryingEnabled: false,
            isPretty: true
        });
        assert.isTrue(executeStub.calledOnce);
        assert.isTrue(processExitStub.calledWith(0));
    });

    it("applies --storage-adapter / --card-names-db / --card-hash-db to the environment before running", async () => {
        const { executeStub } = await runCli({
            filePath: "./some-path.jpg",
            flags: {
                q: false,
                query: false,
                p: true,
                pretty: true,
                storageAdapter: "rds",
                cardNamesDb: "/tmp/names.db",
                cardHashDb: "/tmp/hashes.db"
            }
        });

        assert.equal(process.env.STORAGE_ADAPTER, "rds");
        assert.equal(process.env.CARD_NAMES_DB_PATH, "/tmp/names.db");
        assert.equal(process.env.CARD_HASH_DB_PATH, "/tmp/hashes.db");
        assert.isTrue(executeStub.calledOnce);
        assert.isTrue(processExitStub.calledWith(0));
    });

    it("bails out with a clear error and does not run when --storage-adapter is unknown", async () => {
        const { processorCreateStub } = await runCli({
            filePath: "./some-path.jpg",
            flags: {
                q: false,
                query: false,
                p: true,
                pretty: true,
                storageAdapter: "mongo"
            }
        });

        assert.isTrue(
            consoleLogStub.calledWithMatch(sinon.match(/Invalid storageAdapter "mongo"/))
        );
        assert.isFalse(processorCreateStub.called);
        assert.isFalse(processExitStub.called);
    });

    it("applies LOCAL_CACHE_ENABLED=false when --no-local-cache was explicitly passed", async () => {
        await runCli({
            filePath: "./some-path.jpg",
            flags: {
                q: false,
                query: false,
                p: true,
                pretty: true,
                localCache: false,
                _localCacheExplicit: true
            }
        });

        assert.equal(process.env.LOCAL_CACHE_ENABLED, "false");
        assert.isTrue(processExitStub.calledWith(0));
    });

    it("defaults LOCAL_CACHE_ENABLED=true when --no-local-cache was not passed", async () => {
        await runCli({
            filePath: "./some-path.jpg",
            flags: { q: false, query: false, p: true, pretty: true }
        });

        assert.equal(process.env.LOCAL_CACHE_ENABLED, "true");
    });

    it("defaults COLLECTION_ENABLED=false when --enable-collection was not passed", async () => {
        const { processorCreateStub } = await runCli({
            filePath: "./some-path.jpg",
            flags: { q: false, query: false, p: true, pretty: true, enableCollection: false }
        });

        assert.equal(process.env.COLLECTION_ENABLED, "false");
        assert.deepInclude(processorCreateStub.firstCall.args[0], { collectionEnabled: false });
    });

    it("applies COLLECTION_ENABLED=true and threads collectionEnabled to the processor when --enable-collection is passed", async () => {
        const { processorCreateStub } = await runCli({
            filePath: "./some-path.jpg",
            flags: { q: false, query: false, p: true, pretty: true, enableCollection: true }
        });

        assert.equal(process.env.COLLECTION_ENABLED, "true");
        assert.deepInclude(processorCreateStub.firstCall.args[0], { collectionEnabled: true });
    });

    describe("log subcommands", () => {
        it("log dump prints table-formatted entries and exits 0", async () => {
            const dumpStub = sandbox.stub(storage.log, "dump").callsFake((opts, cb) => {
                cb(null, [
                    {
                        loggedAt: new Date("2026-01-01T00:00:00Z"),
                        decision: "collection",
                        filePath: "./a.jpg"
                    }
                ]);
            });

            await runCli({ command: "log-dump", flags: { limit: "50", format: "table" } });

            assert.isTrue(dumpStub.calledOnce);
            assert.isTrue(consoleLogStub.calledWithMatch(sinon.match(/collection/)));
            assert.isTrue(processExitStub.calledWith(0));
        });

        it("log dump prints JSON when --format json is passed", async () => {
            sandbox.stub(storage.log, "dump").callsFake((opts, cb) => {
                cb(null, [{ decision: "collection" }]);
            });

            await runCli({ command: "log-dump", flags: { limit: "50", format: "json" } });

            const printed = consoleLogStub.firstCall.args[0];
            assert.deepEqual(JSON.parse(printed), [{ decision: "collection" }]);
        });

        it("log stats prints aggregate JSON and exits 0", async () => {
            const statsStub = sandbox.stub(storage.log, "stats").callsFake((cb) => {
                cb(null, {
                    total: 3,
                    byDecision: { collection: 3 },
                    errorCount: 0,
                    avgTopConfidence: 0.9
                });
            });

            await runCli({ command: "log-stats", flags: {} });

            assert.isTrue(statsStub.calledOnce);
            const printed = JSON.parse(consoleLogStub.firstCall.args[0]);
            assert.equal(printed.total, 3);
            assert.isTrue(processExitStub.calledWith(0));
        });
    });

    describe("migrate subcommand", () => {
        function fakeCliFor(flags) {
            return { command: "migrate", filePath: "", flags, helpRequested: false };
        }

        async function runMigrateCli(flags, migrateFn) {
            const commanderFactory = sandbox.stub().resolves(fakeCliFor(flags));
            await run({
                argv: [],
                commanderFactory,
                fsAccess: sandbox.stub().resolves(),
                processorFactory: sandbox.stub(),
                migrateFn,
                exit: processExitStub,
                logger: { log: consoleLogStub }
            });
        }

        it("rejects an unsupported --to target without calling migrateFn", async () => {
            const migrateFn = sandbox.stub();
            await runMigrateCli({ to: "nedb" }, migrateFn);

            assert.isFalse(migrateFn.called);
            assert.isTrue(
                consoleLogStub.calledWithMatch(sinon.match(/Unsupported migration target/))
            );
            assert.isTrue(processExitStub.calledWith(1));
        });

        it("runs the migration and exits 0 when there are no errors", async () => {
            const migrateFn = sandbox.stub().resolves({
                collection: { total: 2, migrated: 2, skipped: 0, errors: [] },
                needsAttention: { total: 1, migrated: 1, skipped: 0, errors: [] }
            });

            await runMigrateCli({ to: "rds", dryRun: false, force: false }, migrateFn);

            assert.isTrue(migrateFn.calledOnceWith({ dryRun: false, force: false }));
            const printed = JSON.parse(consoleLogStub.firstCall.args[0]);
            assert.equal(printed.collection.migrated, 2);
            assert.isTrue(processExitStub.calledWith(0));
        });

        it("exits 1 when the migration result contains errors", async () => {
            const migrateFn = sandbox.stub().resolves({
                collection: {
                    total: 1,
                    migrated: 0,
                    skipped: 0,
                    errors: [{ cardName: "Pacifism", error: "connection lost" }]
                },
                needsAttention: { total: 0, migrated: 0, skipped: 0, errors: [] }
            });

            await runMigrateCli({ to: "rds" }, migrateFn);

            assert.isTrue(processExitStub.calledWith(1));
        });

        it("exits 1 with the error message when migrateFn rejects", async () => {
            const migrateFn = sandbox.stub().rejects(new Error("MySQL unreachable"));

            await runMigrateCli({ to: "rds" }, migrateFn);

            assert.isTrue(consoleLogStub.calledWithMatch(sinon.match(/MySQL unreachable/)));
            assert.isTrue(processExitStub.calledWith(1));
        });
    });

    describe("collection subcommands", () => {
        it("collection update sets quantity and exits 0", async () => {
            const setQuantityStub = sandbox
                .stub(storage.collection, "setQuantity")
                .resolves({ cardName: "Pacifism", quantity: 5 });

            await runCli({
                command: "collection-update",
                flags: { cardName: "Pacifism", cardSet: "M20", quantity: "5" }
            });

            assert.isTrue(setQuantityStub.calledOnceWith("Pacifism", "M20", 5));
            assert.isTrue(processExitStub.calledWith(0));
        });

        it("collection update rejects a non-numeric --quantity without calling storage", async () => {
            const setQuantityStub = sandbox.stub(storage.collection, "setQuantity");

            await runCli({
                command: "collection-update",
                flags: { cardName: "Pacifism", cardSet: "M20", quantity: "notanumber" }
            });

            assert.isFalse(setQuantityStub.called);
            assert.isTrue(consoleLogStub.calledWithMatch(sinon.match(/--quantity must be/)));
            assert.isTrue(processExitStub.calledWith(1));
        });

        it("collection update rejects a negative --quantity without calling storage", async () => {
            const setQuantityStub = sandbox.stub(storage.collection, "setQuantity");

            await runCli({
                command: "collection-update",
                flags: { cardName: "Pacifism", cardSet: "M20", quantity: "-1" }
            });

            assert.isFalse(setQuantityStub.called);
            assert.isTrue(processExitStub.calledWith(1));
        });

        it("collection update exits 1 with the error message when the entry doesn't exist", async () => {
            sandbox
                .stub(storage.collection, "setQuantity")
                .rejects(new Error("No collection entry"));

            await runCli({
                command: "collection-update",
                flags: { cardName: "Nonexistent", cardSet: "XYZ", quantity: "5" }
            });

            assert.isTrue(consoleLogStub.calledWithMatch(sinon.match(/No collection entry/)));
            assert.isTrue(processExitStub.calledWith(1));
        });

        it("collection remove deletes the entry and exits 0", async () => {
            const removeStub = sandbox
                .stub(storage.collection, "remove")
                .resolves({ cardName: "Pacifism", cardSet: "M20" });

            await runCli({
                command: "collection-remove",
                flags: { cardName: "Pacifism", cardSet: "M20" }
            });

            assert.isTrue(removeStub.calledOnceWith("Pacifism", "M20"));
            assert.isTrue(processExitStub.calledWith(0));
        });

        it("collection remove exits 1 when nothing matched", async () => {
            sandbox.stub(storage.collection, "remove").resolves(null);

            await runCli({
                command: "collection-remove",
                flags: { cardName: "Nonexistent", cardSet: "XYZ" }
            });

            assert.isTrue(consoleLogStub.calledWithMatch(sinon.match(/No collection entry/)));
            assert.isTrue(processExitStub.calledWith(1));
        });
    });
});

describe("CLI::index.mjs buildCli (real commander wiring)", () => {
    it("parses `scan <file>` with no flags to explicit-source=false, localCache=true", () => {
        const parsed = buildCli(["scan", "./card.jpg"]);
        assert.equal(parsed.command, "scan");
        assert.equal(parsed.filePath, "./card.jpg");
        assert.equal(parsed.flags.localCache, true);
        assert.equal(parsed.flags._localCacheExplicit, false);
    });

    it("parses `scan <file> --no-local-cache` to explicit-source=true, localCache=false", () => {
        const parsed = buildCli(["scan", "./card.jpg", "--no-local-cache"]);
        assert.equal(parsed.flags.localCache, false);
        assert.equal(parsed.flags._localCacheExplicit, true);
    });

    it("parses `scan <file>` with enableCollection=false by default", () => {
        const parsed = buildCli(["scan", "./card.jpg"]);
        assert.equal(parsed.flags.enableCollection, false);
    });

    it("parses `scan <file> --enable-collection` to enableCollection=true", () => {
        const parsed = buildCli(["scan", "./card.jpg", "--enable-collection"]);
        assert.equal(parsed.flags.enableCollection, true);
    });

    it("parses `log dump --limit 5 --format json`", () => {
        const parsed = buildCli(["log", "dump", "--limit", "5", "--format", "json"]);
        assert.equal(parsed.command, "log-dump");
        assert.equal(parsed.flags.limit, "5");
        assert.equal(parsed.flags.format, "json");
    });

    it("parses `log stats`", () => {
        const parsed = buildCli(["log", "stats"]);
        assert.equal(parsed.command, "log-stats");
    });

    it("does not throw on empty argv -- commander shows top-level help instead", () => {
        const parsed = buildCli([]);
        assert.equal(parsed.helpRequested, true);
    });

    it("does not throw on `scan` with a missing required filePath argument", () => {
        // Regression: commander.missingArgument used to propagate as a raw uncaught
        // CommanderError instead of being handled the same way as --help.
        const parsed = buildCli(["scan"]);
        assert.equal(parsed.helpRequested, true);
    });

    it("does not throw on an unknown flag", () => {
        const parsed = buildCli(["scan", "./card.jpg", "--not-a-real-flag"]);
        assert.equal(parsed.helpRequested, true);
    });

    it("parses `migrate --to rds --dry-run`", () => {
        const parsed = buildCli(["migrate", "--to", "rds", "--dry-run"]);
        assert.equal(parsed.command, "migrate");
        assert.equal(parsed.flags.to, "rds");
        assert.equal(parsed.flags.dryRun, true);
        assert.equal(parsed.flags.force, false);
    });

    it("does not throw when `migrate` is missing --to", () => {
        const parsed = buildCli(["migrate"]);
        assert.equal(parsed.helpRequested, true);
    });

    it("parses `collection update <name> <set> --quantity 3`", () => {
        const parsed = buildCli(["collection", "update", "Pacifism", "M20", "--quantity", "3"]);
        assert.equal(parsed.command, "collection-update");
        assert.equal(parsed.flags.cardName, "Pacifism");
        assert.equal(parsed.flags.cardSet, "M20");
        assert.equal(parsed.flags.quantity, "3");
    });

    it("parses `collection remove <name> <set>`", () => {
        const parsed = buildCli(["collection", "remove", "Pacifism", "M20"]);
        assert.equal(parsed.command, "collection-remove");
        assert.equal(parsed.flags.cardName, "Pacifism");
        assert.equal(parsed.flags.cardSet, "M20");
    });

    it("does not throw when `collection update` is missing --quantity", () => {
        const parsed = buildCli(["collection", "update", "Pacifism", "M20"]);
        assert.equal(parsed.helpRequested, true);
    });
});

describe("CLI::index.mjs run() argv normalization (real buildCli)", () => {
    let sandbox;
    let processExitStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        processExitStub = sandbox.stub();
    });

    afterEach(() => {
        sandbox.restore();
    });

    async function runReal(argv) {
        const consoleLogStub = sandbox.stub();
        const processorCreateStub = sandbox.stub().returns({
            execute: sandbox.stub().callsFake((cb) => cb && cb())
        });
        await run({
            argv,
            fsAccess: sandbox.stub().resolves(),
            processorFactory: processorCreateStub,
            exit: processExitStub,
            logger: { log: consoleLogStub }
        });
        return { consoleLogStub, processorCreateStub };
    }

    it("bare invoke (no args) does not crash and does not invoke the processor", async () => {
        const { processorCreateStub } = await runReal([]);
        assert.isFalse(processorCreateStub.called);
        assert.isFalse(processExitStub.called);
    });

    it("--help does not get silently prefixed into `scan --help`", async () => {
        // Commander writes help straight to process.stdout, bypassing the injected logger --
        // capture the real stream to verify the top-level command list (scan + log) is shown,
        // not just scan's own options.
        const writeStub = sandbox.stub(process.stdout, "write");
        await runReal(["--help"]);
        const printed = writeStub
            .getCalls()
            .map((call) => call.args[0])
            .join("");
        assert.match(printed, /log\s+Inspect the local operations log/);
    });

    it("an unknown flag does not crash the process", async () => {
        const { processorCreateStub } = await runReal(["scan", "./x.jpg", "--not-a-real-flag"]);
        assert.isFalse(processorCreateStub.called);
        assert.isFalse(processExitStub.called);
    });
});
