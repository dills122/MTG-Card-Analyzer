const {
    CreateConnection
} = require('./connection');

function InsertEntity(record) {
    let connection = CreateConnection();
    connection.connect((err) => {
        connection.query('INSERT INTO Card_Catalog SET ?', record, (error, results, fields) => {
            if (error) {
                console.log(error);
            }
            return connection.end();
        });
    });
}

function GetQuantity(name, set, cb) {
    let connection = CreateConnection();
    connection.connect((err) => {
        connection.query('SELECT Quantity FROM Card_Catalog WHERE CardName=? AND CardSet=?', [name, set], (error, results, fields) => {
            if (error) {
                console.log(error);
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