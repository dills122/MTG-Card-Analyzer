const mysql = require('mysql');
const {
    requireF
} = require('../util');
const secureConfig = requireF('../secure.config') || {
    rds: {

    }
};

module.exports = {
    CreateConnection: function() {
        return mysql.createConnection({
            host: secureConfig.rds.host,
            user: secureConfig.rds.user,
            password: secureConfig.rds.password,
            database: secureConfig.rds.database
        });        
    }
};