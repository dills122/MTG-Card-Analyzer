const {
    CreateConnection
} = require('./connection');

function InsertEntity(record) {
    let connection = CreateConnection();
    connection.connect((err) => {
        if(err) {
            return cb(err);
        }
        connection.query('INSERT INTO Image_Results SET ?', record, (error) => {
            if (error) {
                console.log(error);
            }
            return connection.end();
        });
    });
}

function GetHashes(name, set, cb) {
    let connection = CreateConnection();
    connection.connect((err) => {
        if(err) {
            return cb(err);
        }
        connection.query('SELECT ArtImage as artImage, FlavorImage as flavorImage, ArtImageHash as artImageHash, FlavorImageHash as flavorImageHash, FlavorMatchPercent as flavorMatchPercent, ArtMatchPercent as artMatchPercent FROM Image_Results WHERE Name=? AND SetName=?', [name, set], (error, results) => {
            if (error) {
                console.log(error);
                connection.end();
                return cb(error);
            }
            connection.end();
            return cb(null, results ? results : 0);
        });
    });
}

module.exports = {
    InsertEntity,
    GetHashes
}