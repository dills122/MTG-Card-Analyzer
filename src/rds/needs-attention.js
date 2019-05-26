const {
    CreateConnection
} = require('./connection');

function InsertEntity(record) {
    let connection = CreateConnection();
    connection.connect((err) => {
        connection.query('INSERT INTO Card_NEED_ATTN SET ?', record, (error, results, fields) => {
            if(error) {
                console.log(error);
            }
            return connection.end();
        });
    });
}

module.exports = {
    InsertEntity
}