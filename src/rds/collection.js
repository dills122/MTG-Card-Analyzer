const {
    CreateConnection
} = require('./connection');

function InsertEntity(record) {
    let connection = CreateConnection().connect();

    let query = connection.query('INSERT INTO Card_Catalog SET ?', record, (error, results, fields) => {
        if(error) throw error;
    });
}

function GetQuantity(name, set, cb) {
    let connection = CreateConnection().connect();
    let query = connection.query('SELECT quantity FROM Card_Catalog WHERE name=? AND set=?', [name, set], (error, results, fields) => {
        if(error) {
            return cb(error);
        }
        return cb(results);
    });
}

module.exports = {
    InsertEntity,
    GetQuantity
}