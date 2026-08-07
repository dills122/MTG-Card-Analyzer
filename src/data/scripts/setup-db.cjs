#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");
const { promisify } = require("util");
const secureConfigPath = path.resolve(__dirname, "../../../secure.config.cjs");
let secureConfig;
try {
    secureConfig = require(secureConfigPath);
} catch (err) {
    console.error(err);
    secureConfig = null;
}

if (!secureConfig || !secureConfig.rds) {
    console.error(
        "secure.config.cjs is missing or incomplete. Copy secure.config.template.cjs and fill in your database credentials."
    );
    process.exit(1);
}

const { host, port, user, password, database } = secureConfig.rds;

if (!host || !user || !database) {
    console.error("secure.config.cjs is missing required rds settings (host, user, database).");
    process.exit(1);
}

const scriptsDir = path.join(__dirname, "sql");
const shouldTruncate = process.argv.includes("--truncate") || process.argv.includes("-t");
const createScripts = [
    {
        file: "create-collection.sql",
        table: "CardCollection"
    },
    {
        file: "create-needs-attention.sql",
        table: "Card_NEED_ATTN"
    }
];

function createConnection() {
    return mysql.createConnection({
        host,
        port,
        user,
        password
    });
}

async function runSqlFile(query, filePath) {
    const sql = fs
        .readFileSync(filePath, "utf8")
        .replace(/use\\s+[^;]+;/gi, "")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);

    for (const statement of sql) {
        await query(statement);
    }
}

async function tableExists(query, tableName) {
    const rows = await query("SHOW TABLES LIKE ?", [tableName]);
    return Array.isArray(rows) && rows.length > 0;
}

(async () => {
    const connection = createConnection();
    // A connection error (e.g. MySQL unreachable) fires asynchronously via the 'error' event
    // and would otherwise crash the process with an unhandled error -- catch it here so the
    // real failure gets one clean message instead of two (the original error plus a
    // secondary "connection is in closed state" error from calling .end() on it below).
    let connectionErrored = false;
    connection.on("error", () => {
        connectionErrored = true;
    });
    const query = promisify(connection.query).bind(connection);

    try {
        console.log("Ensuring database exists...");
        await query("CREATE DATABASE IF NOT EXISTS ??;", [database]);
        await query("USE ??;", [database]);

        for (const script of createScripts) {
            if (await tableExists(query, script.table)) {
                console.log(`Skipping ${script.table}; table already exists.`);
                continue;
            }

            const filePath = path.join(scriptsDir, script.file);
            console.log(`Running ${script.file}...`);
            await runSqlFile(query, filePath);
            console.log(`Created ${script.table}.`);
        }

        if (shouldTruncate) {
            const destroyPath = path.join(scriptsDir, "destroy-tables.sql");
            if (fs.existsSync(destroyPath)) {
                console.log("Truncating tables via destroy-tables.sql...");
                await runSqlFile(query, destroyPath);
            } else {
                console.warn("destroy-tables.sql not found; skipping truncate step.");
            }
        }

        console.log("Database setup complete.");
    } catch (error) {
        console.error("Database setup failed:", error.message || error);
        process.exitCode = 1;
    } finally {
        if (!connectionErrored) {
            connection.end();
        }
    }
})();
