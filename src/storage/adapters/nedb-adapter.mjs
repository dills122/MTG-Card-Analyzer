import { db as namesDb } from "../../db-local/db.mjs";
import cardHashCache from "../../db-local/card-hash-cache.mjs";

function getAllNames() {
    return new Promise((resolve, reject) => {
        namesDb.find({}, (err, docs) => {
            if (err) {
                return reject(err);
            }
            return resolve(docs || []);
        });
    });
}

function getHashesByCardName(cardName) {
    return new Promise((resolve, reject) => {
        cardHashCache.GetHashes(cardName, (err, docs) => {
            if (err) {
                return reject(err);
            }
            return resolve(docs || []);
        });
    });
}

function upsertHash(record) {
    cardHashCache.InsertEntity(record);
}

function createNedbAdapter() {
    return {
        adapterName: "nedb",
        names: {
            getAll: getAllNames
        },
        hashes: {
            getByCardName: getHashesByCardName,
            upsert: upsertHash
        }
    };
}

export { createNedbAdapter };

export default {
    createNedbAdapter
};
