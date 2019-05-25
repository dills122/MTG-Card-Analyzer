const {
    CreateConnection
} = require('./connection');

function InsertEntity(record) {
    let connection = CreateConnection().connect();

    let query = connection.query('INSERT INTO Transactions SET ?', record, (error, results, fields) => {
        if(error) throw error;
    });
}

module.exports = {
    InsertEntity
}