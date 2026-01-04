import { CreateConnection } from "./connection.mjs";
import log from "../logger/log.mjs";

const logger = log.create({
    isPretty: true
});

function InsertEntity(record, cb) {
    const connection = CreateConnection();
    connection.connect((err) => {
        if (err) {
            return cb(err);
        }
        connection.query("INSERT INTO Transactions SET ?", record, (error) => {
            if (error) {
                logger.error(error);
            }
            return connection.end();
        });
    });
}

export { InsertEntity };

export default {
    InsertEntity
};
