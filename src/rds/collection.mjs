import { CreateConnection } from "./connection.mjs";
import log from "../logger/log.mjs";

const logger = log.create({
    isPretty: true
});

function GetQuantity(name, set, cb) {
    const connection = CreateConnection();
    connection.connect((err) => {
        if (err) {
            return cb(err, null);
        }
        connection.query(
            "SELECT quantity FROM CardCollection WHERE cardName=? AND cardSet=? LIMIT 1",
            [name, set],
            (err, results) => {
                if (err) {
                    logger.error(err);
                    return cb(err, null);
                }
                connection.end();
                return cb(null, (results && results[0] && results[0].quantity) || 0);
            }
        );
    });
}

function InsertRecord(record, cb) {
    const connection = CreateConnection();
    connection.connect((err) => {
        if (err) {
            return cb(err, null);
        }
        connection.query(
            "INSERT INTO CardCollection (cardName, cardSet, quantity) VALUES (?, ?, ?)",
            [record.cardName, record.cardSet, record.quantity],
            (err, results) => {
                if (err) {
                    logger.error(err);
                    return cb(err, null);
                }
                connection.end();
                return cb(null, results);
            }
        );
    });
}

// Insert if new, add `delta` (default 1) to quantity if cardName+cardSet already exists --
// same "scanned another copy" semantics as the nedb-backed collection-store. Uses MySQL's
// native upsert (CardCollection has a UNIQUE(cardName, cardSet) constraint) instead of a
// separate SELECT-then-branch, so it's atomic at the DB level.
function UpsertRecord(record, cb) {
    const connection = CreateConnection();
    const delta = record.delta ?? 1;
    // estValue tracks the whole stack's worth. MySQL evaluates ON DUPLICATE KEY UPDATE's SET
    // list left-to-right, and a column already assigned earlier in the list is read back at
    // its NEW value by later expressions in the same statement (not the pre-update value) --
    // so because `quantity` is assigned first, referencing bare `quantity` in the estValue
    // expression below already sees the post-increment total. Verified against a real MySQL
    // 8 instance; this is not the "obvious" reading of ON DUPLICATE KEY UPDATE semantics.
    const priceUsd = typeof record.priceUsd === "number" ? record.priceUsd : null;
    connection.connect((err) => {
        if (err) {
            return cb(err, null);
        }
        connection.query(
            `INSERT INTO CardCollection (cardName, cardType, cardSet, quantity, estValue, automated, magicId, imageUrl)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                quantity = quantity + VALUES(quantity),
                cardType = VALUES(cardType),
                estValue = IF(? IS NOT NULL, quantity * ?, VALUES(estValue)),
                automated = VALUES(automated),
                magicId = VALUES(magicId),
                imageUrl = VALUES(imageUrl)`,
            [
                record.cardName,
                record.cardType,
                record.cardSet,
                delta,
                priceUsd !== null ? priceUsd * delta : record.estValue,
                record.automated,
                record.magicId,
                record.imageUrl,
                priceUsd,
                priceUsd
            ],
            (err, results) => {
                if (err) {
                    logger.error(err);
                    return cb(err, null);
                }
                connection.end();
                return cb(null, results);
            }
        );
    });
}

export { GetQuantity, InsertRecord, UpsertRecord };

export default {
    GetQuantity,
    InsertRecord,
    UpsertRecord
};
