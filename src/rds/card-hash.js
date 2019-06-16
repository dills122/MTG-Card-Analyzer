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
            return err;
        }
        connection.query('INSERT INTO Card_Hashes SET ?', record, (error) => {
            if (error) {
                // console.log(error);
            }
            return connection.end();
        });
    });
}

function GetHashes(name, cb) {
    let connection = CreateConnection();
    connection.connect((err) => {
        if(err) {
            return cb(err);
        }
        connection.query('SELECT CardHash as cardHash, SetName as setName, IsFoil as isFoil, IsPromo as isPromo FROM Card_Hashes WHERE CardName=?', [name], (error, results) => {
            if (error) {
                logger.error(error);
                connection.end();
                return cb(error);
            }
            if(results.length === 0) {
                return cb(null, []);
            }
            connection.end();
            return cb(null, results);
        });
    });
}

module.exports = {
    InsertEntity,
    GetHashes
}