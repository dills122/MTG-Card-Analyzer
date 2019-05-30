const {
    CreateConnection
} = require('./connection');

function InsertEntity(record) {
    let connection = CreateConnection();
    connection.connect((err) => {
        if(err) {
            return cb(err);
        }
        connection.query('INSERT INTO Transactions SET ?', record, (error) => {
            if (error) {
                console.log(error);
            }
            return connection.end();
        });
    });
}

module.exports = {
    InsertEntity
}