import { createConnection } from "./connection.mjs";
import log from "../logger/log.mjs";

const logger = log.create({
    isPretty: true
});

async function insertRecord(record) {
    const connection = await createConnection();
    try {
        const [results] = await connection.query(
            "INSERT INTO Card_NEED_ATTN (cardName, possibleSets, extractedText, dirtyExtractedText, nameImage) VALUES (?, ?, ?, ?, ?)",
            [
                record.cardName,
                record.possibleSets,
                record.extractedText,
                record.dirtyExtractedText,
                record.nameImage
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

export { insertRecord };

export default {
    insertRecord
};
