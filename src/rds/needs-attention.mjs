import { CreateConnection } from "./connection.mjs";
import log from "../logger/log.mjs";

const logger = log.create({
    isPretty: true
});

function InsertRecord(record, cb) {
    const connection = CreateConnection();
    connection.connect((err) => {
        if (err) {
            return cb(err, null);
        }
        connection.query(
            "INSERT INTO NeedsAttention (cardName, possibleSets, extractedText, dirtyExtractedText, nameImage) VALUES (?, ?, ?, ?, ?)",
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

export { InsertRecord };

export default {
    InsertRecord
};
