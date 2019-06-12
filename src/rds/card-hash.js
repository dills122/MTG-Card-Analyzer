const {
    CreateConnection
} = require('./connection');

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
        connection.query('SELECT CardHash as cardHash, SetName as setName, IsFoil as isFoil, IsPromo as isPromo FROM Card_Hashes WHERE Name=?', [name], (error, results) => {
            if (error) {
                console.log(error);
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