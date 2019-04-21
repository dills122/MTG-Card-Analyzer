const mysql = require('mysql');
const secureConfig = require('../../secure.config');

module.exports = {
    CreateConnection() {
        return mysql.createConnection({
            host: secureConfig.rds.host,
            user: secureConfig.rds.user,
            password: secureConfig.rds.password,
            database: secureConfig.rds.database
        });        
    }
};