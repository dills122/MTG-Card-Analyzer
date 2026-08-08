import { createConnection } from "./connection.mjs";
import log from "../logger/log.mjs";

const logger = log.create({
    isPretty: true
});

function insertRecord(record, cb) {
    const connection = createConnection();
    connection.connect((err) => {
        if (err) {
            return cb(err, null);
        }
        connection.query(
            "INSERT INTO Card_NEED_ATTN (cardName, possibleSets, extractedText, dirtyExtractedText, nameImage) VALUES (?, ?, ?, ?, ?)",
            [
                record.cardName,
                record.possibleSets,
                record.extractedText,
                record.dirtyExtractedText,
                record.nameImage
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

export { insertRecord };

export default {
    insertRecord
};
