const {
    db
} = require('./db');

function GetBulkNames(cb) {
    db.find({}, (err, docs) => {
        if (err) {
            return cb(err);
        }
        return cb(null, docs || []);
    });
}

module.exports = {
    GetBulkNames
}