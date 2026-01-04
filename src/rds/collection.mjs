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
            `SELECT quantity FROM CardCollection WHERE cardName="${name}" AND cardSet="${set}" LIMIT 1`,
            [],
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
            `INSERT INTO CardCollection (cardName, cardSet, quantity) VALUES ("${record.cardName}","${record.cardSet}","${record.quantity}")`,
            [],
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

export { GetQuantity, InsertRecord };

export default {
    GetQuantity,
    InsertRecord
};
