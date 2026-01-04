import { db } from "./db.mjs";
import scryfallApi from "../scryfall-api/index.mjs";

const { GetCardNames } = scryfallApi;

async function ExecuteBulkInsert() {
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
    await ExecuteBulkInsert();
})();

export { ExecuteBulkInsert };

export default {
    ExecuteBulkInsert
};
