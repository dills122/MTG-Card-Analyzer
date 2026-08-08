import { createConnection } from "./connection.mjs";
import log from "../logger/log.mjs";

const logger = log.create({
    isPretty: true
});

async function getQuantity(name, set) {
    const connection = await createConnection();
    try {
        const [results] = await connection.query(
            "SELECT quantity FROM CardCollection WHERE cardName=? AND cardSet=? LIMIT 1",
            [name, set]
        );
        return (results && results[0] && results[0].quantity) || 0;
    } catch (err) {
        logger.error(err);
        throw err;
    } finally {
        await connection.end();
    }
}

async function insertRecord(record) {
    const connection = await createConnection();
    try {
        const [results] = await connection.query(
            "INSERT INTO CardCollection (cardName, cardSet, quantity) VALUES (?, ?, ?)",
            [record.cardName, record.cardSet, record.quantity]
        );
        return results;
    } catch (err) {
        logger.error(err);
        throw err;
    } finally {
        await connection.end();
    }
}

// Insert if new, add `delta` (default 1) to quantity if cardName+cardSet already exists --
// same "scanned another copy" semantics as the nedb-backed collection-store. Uses MySQL's
// native upsert (CardCollection has a UNIQUE(cardName, cardSet) constraint) instead of a
// separate SELECT-then-branch, so it's atomic at the DB level.
async function upsertRecord(record) {
    const delta = record.delta ?? 1;
    // estValue tracks the whole stack's worth. MySQL evaluates ON DUPLICATE KEY UPDATE's SET
    // list left-to-right, and a column already assigned earlier in the list is read back at
    // its NEW value by later expressions in the same statement (not the pre-update value) --
    // so because `quantity` is assigned first, referencing bare `quantity` in the estValue
    // expression below already sees the post-increment total. Verified against a real MySQL
    // 8 instance; this is not the "obvious" reading of ON DUPLICATE KEY UPDATE semantics.
    const priceUsd = typeof record.priceUsd === "number" ? record.priceUsd : null;
    const connection = await createConnection();
    try {
        const [results] = await connection.query(
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
            ]
        );
        return results;
    } catch (err) {
        logger.error(err);
        throw err;
    } finally {
        await connection.end();
    }
}

// Manual correction -- sets quantity to an exact value instead of adding to it. Errors if the
// entry doesn't exist (affectedRows is a reliable existence check regardless of whether the
// new value happens to equal the old one, unlike changedRows). estValue is rescaled
// proportionally from the existing per-unit value when possible.
//
// The estValue expression MUST be assigned before quantity in the SET list: MySQL evaluates
// UPDATE's SET list left-to-right, and a column already assigned earlier is read at its NEW
// value by later expressions in the same statement -- same rule that bit upsertRecord's
// estValue expression. Verified against a real MySQL 8 instance: reversing this order silently
// computes a no-op ratio instead of the intended rescale.
async function setQuantity(name, set, quantity) {
    const connection = await createConnection();
    try {
        const [results] = await connection.query(
            `UPDATE CardCollection
             SET estValue = CASE WHEN quantity > 0 THEN ROUND((estValue / quantity) * ?, 4) ELSE estValue END,
                 quantity = ?
             WHERE cardName = ? AND cardSet = ?`,
            [quantity, quantity, name, set]
        );
        if (!results.affectedRows) {
            throw new Error(`No collection entry for "${name}" (${set})`);
        }
        return results;
    } catch (err) {
        if (!/No collection entry/.test(err.message)) {
            logger.error(err);
        }
        throw err;
    } finally {
        await connection.end();
    }
}

// Deletes a collection entry outright. Returns the removed row (or null if nothing matched)
// so callers can report what was actually removed.
async function deleteRecord(name, set) {
    const connection = await createConnection();
    try {
        const [rows] = await connection.query(
            `SELECT cardName, cardType, cardSet, quantity, estValue, automated, magicId, imageUrl
             FROM CardCollection WHERE cardName = ? AND cardSet = ? LIMIT 1`,
            [name, set]
        );
        const existing = rows && rows[0];
        if (!existing) {
            return null;
        }
        await connection.query("DELETE FROM CardCollection WHERE cardName = ? AND cardSet = ?", [
            name,
            set
        ]);
        return existing;
    } catch (err) {
        logger.error(err);
        throw err;
    } finally {
        await connection.end();
    }
}

export { getQuantity, insertRecord, upsertRecord, setQuantity, deleteRecord };

export default {
    getQuantity,
    insertRecord,
    upsertRecord,
    setQuantity,
    deleteRecord
};
