import mysql from "mysql2";
import { requireF } from "../util.mjs";

const secureConfig = requireF("../secure.config.cjs") || {
    rds: {}
};

function CreateConnection() {
    return mysql.createConnection({
        host: secureConfig.rds.host,
        user: secureConfig.rds.user,
        password: secureConfig.rds.password,
        database: secureConfig.rds.database
    });
}

export { CreateConnection };

export default {
    CreateConnection
};
