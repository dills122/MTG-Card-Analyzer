import mysql from "mysql2/promise";
import { requireOrFalse } from "../util.mjs";

// Resolved lazily, only when a connection is actually attempted -- not at import time.
// This module is imported unconditionally (both storage adapters are wired up regardless
// of which one is selected), so eager resolution here logged a scary "could not be loaded"
// error on every single run, even in pure-local nedb mode that never touches MySQL.
let secureConfig;

function getSecureConfig() {
    if (!secureConfig) {
        secureConfig = requireOrFalse("../secure.config.cjs") || { rds: {} };
    }
    return secureConfig;
}

// Returns a promise resolving to a connected mysql2 connection -- mysql2/promise's
// createConnection() already waits for the underlying "connect" event before resolving, so
// there's no separate .connect() step to call (unlike the callback-based mysql2 API this used
// to use).
function createConnection({ secureConfig: config = getSecureConfig() } = {}) {
    return mysql.createConnection({
        host: config.rds.host,
        port: config.rds.port,
        user: config.rds.user,
        password: config.rds.password,
        database: config.rds.database
    });
}

export { createConnection };

export default {
    createConnection
};
