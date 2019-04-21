const {
    LocalCardDb
} = require('./db');
const {
    GetCardNames
} = require('../scryfall-api/index');

async function ExecuteBulkInsert() {
    let names = await GetCardNames();
    names.forEach((name) => {
        LocalCardDb.insert({
            name
        }, (err, doc) => {
            if (!err) {
                console.log('local inserted');
            }
        });
    });
}

(async () => {
    await ExecuteBulkInsert()
})();