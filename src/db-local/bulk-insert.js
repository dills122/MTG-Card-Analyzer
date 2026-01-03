const { db } = require("./db");
const { GetCardNames } = require("../scryfall-api/index");

async function ExecuteBulkInsert() {
    let names = await GetCardNames();
    names.forEach((name) => {
        db.insert(
            {
                name
            },
            (err) => {
                if (!err) {
                    console.log("local inserted");
                }
            }
        );
    });
}

(async () => {
    await ExecuteBulkInsert();
})();
