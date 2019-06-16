const {
    CreateConnection
} = require('./connection');
const log = require('../logger/log');
const logger = log.create({
    isPretty: true
});

function InsertEntity(record, cb) {
    let connection = CreateConnection();
    connection.connect((err) => {
        if(err) {
            return cb(err);
        }
        connection.query('INSERT INTO Card_NEED_ATTN SET ?', record, (error, results) => {
            if(error) {
                logger.error(error);
                cb(error);
            }
            connection.end();
            return cb(null, results);
        });
    });
}

module.exports = {
    InsertEntity
}