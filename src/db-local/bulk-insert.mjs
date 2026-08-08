import { db } from "./db.mjs";
import scryfallApi from "../scryfall-api/index.mjs";

const { GetCardNames } = scryfallApi;

async function executeBulkInsert() {
    const names = await GetCardNames();
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
    await executeBulkInsert();
})();

export { executeBulkInsert };

export default {
    executeBulkInsert
};
