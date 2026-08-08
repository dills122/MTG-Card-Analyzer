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

// Manual correction -- sets quantity to an exact value instead of adding to it. Errors if the
// entry doesn't exist (affectedRows is a reliable existence check regardless of whether the
// new value happens to equal the old one, unlike changedRows). estValue is rescaled
// proportionally from the existing per-unit value when possible.
//
// The estValue expression MUST be assigned before quantity in the SET list: MySQL evaluates
// UPDATE's SET list left-to-right, and a column already assigned earlier is read at its NEW
// value by later expressions in the same statement -- same rule that bit UpsertRecord's
// estValue expression. Verified against a real MySQL 8 instance: reversing this order silently
// computes a no-op ratio instead of the intended rescale.
function SetQuantity(name, set, quantity, cb) {
    const connection = CreateConnection();
    connection.connect((err) => {
        if (err) {
            return cb(err, null);
        }
        connection.query(
            `UPDATE CardCollection
             SET estValue = CASE WHEN quantity > 0 THEN ROUND((estValue / quantity) * ?, 4) ELSE estValue END,
                 quantity = ?
             WHERE cardName = ? AND cardSet = ?`,
            [quantity, quantity, name, set],
            (err, results) => {
                if (err) {
                    logger.error(err);
                    return cb(err, null);
                }
                connection.end();
                if (!results.affectedRows) {
                    return cb(new Error(`No collection entry for "${name}" (${set})`), null);
                }
                return cb(null, results);
            }
        );
    });
}

// Deletes a collection entry outright. Returns the removed row (or null if nothing matched)
// so callers can report what was actually removed.
function DeleteRecord(name, set, cb) {
    const connection = CreateConnection();
    connection.connect((err) => {
        if (err) {
            return cb(err, null);
        }
        connection.query(
            `SELECT cardName, cardType, cardSet, quantity, estValue, automated, magicId, imageUrl
             FROM CardCollection WHERE cardName = ? AND cardSet = ? LIMIT 1`,
            [name, set],
            (selectErr, rows) => {
                if (selectErr) {
                    logger.error(selectErr);
                    connection.end();
                    return cb(selectErr, null);
                }
                const existing = rows && rows[0];
                if (!existing) {
                    connection.end();
                    return cb(null, null);
                }
                connection.query(
                    "DELETE FROM CardCollection WHERE cardName = ? AND cardSet = ?",
                    [name, set],
                    (deleteErr) => {
                        connection.end();
                        if (deleteErr) {
                            logger.error(deleteErr);
                            return cb(deleteErr, null);
                        }
                        return cb(null, existing);
                    }
                );
            }
        );
    });
}

export { GetQuantity, InsertRecord, UpsertRecord, SetQuantity, DeleteRecord };

export default {
    GetQuantity,
    InsertRecord,
    UpsertRecord,
    SetQuantity,
    DeleteRecord
};
