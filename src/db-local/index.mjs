import dbModule from "./db.mjs";
import grabNames from "./grab-names.mjs";

export const LocalCardDb = dbModule.db;
export const GetBulkNames = grabNames.GetBulkNames;

export default {
    LocalCardDb,
    GetBulkNames
};
