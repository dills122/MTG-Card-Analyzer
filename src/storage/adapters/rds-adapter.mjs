import rds from "../../rds/index.mjs";
import { db as namesDb } from "../../db-local/db.mjs";

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
        rds.CardHashes.GetHashes(cardName, (err, docs) => {
            if (err) {
                return reject(err);
            }
            return resolve(docs || []);
        });
    });
}

function upsertHash(record) {
    rds.CardHashes.InsertEntity(record);
}

function createRdsAdapter() {
    return {
        adapterName: "rds",
        names: {
            getAll: getAllNames
        },
        hashes: {
            getByCardName: getHashesByCardName,
            upsert: upsertHash
        }
    };
}

export { createRdsAdapter };

export default {
    createRdsAdapter
};
