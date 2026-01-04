import { db } from "./db.mjs";

function GetBulkNames(cb) {
    db.find({}, (err, docs) => {
        if (err) {
            return cb(err);
        }
        return cb(null, docs || []);
    });
}

export { GetBulkNames };

export default {
    GetBulkNames
};
