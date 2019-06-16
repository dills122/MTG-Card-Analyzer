const {
    CreateConnection
} = require('./connection');
const log = require('../logger/log');
const logger = log.create({
    isPretty: true
});
function InsertEntity(record) {
    let connection = CreateConnection();
    connection.connect((err) => {
        if(err) {
            return cb(err);
        }
        connection.query('INSERT INTO Card_Catalog SET ?', record, (error) => {
            if (error) {
                logger.error(error);
            }
            return connection.end();
        });
    });
}

function GetQuantity(name, set, cb) {
    let connection = CreateConnection();
    connection.connect((err) => {
        if(err) {
            return cb(err);
        }
        connection.query('SELECT Quantity FROM Card_Catalog WHERE CardName=? AND CardSet=?', [name, set], (error, results) => {
            if (error) {
                logger.error(error);
                connection.end();
                return cb(error);
            }
            connection.end();

            if(results.length === 0) {
                return cb(null, 0);
            }
            let result = results[0] || {};
            return cb(null, result ? result.Quantity : 0);
        });
    });
}

module.exports = {
    InsertEntity,
    GetQuantity
}