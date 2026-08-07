import mysql from "mysql2";
import { requireF } from "../util.mjs";

// Resolved lazily, only when a connection is actually attempted -- not at import time.
// This module is imported unconditionally (both storage adapters are wired up regardless
// of which one is selected), so eager resolution here logged a scary "could not be loaded"
// error on every single run, even in pure-local nedb mode that never touches MySQL.
let secureConfig;

function getSecureConfig() {
    if (!secureConfig) {
        secureConfig = requireF("../secure.config.cjs") || { rds: {} };
    }
    return secureConfig;
}

function CreateConnection() {
    const config = getSecureConfig();
    return mysql.createConnection({
        host: config.rds.host,
        port: config.rds.port,
        user: config.rds.user,
        password: config.rds.password,
        database: config.rds.database
    });
}

export { CreateConnection };

export default {
    CreateConnection
};
