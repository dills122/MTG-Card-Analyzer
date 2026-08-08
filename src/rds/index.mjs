import connectionModule from "./connection.mjs";
import collectionModule from "./collection.mjs";
import needsAttentionModule from "./needs-attention.mjs";

export const createConnection = connectionModule.createConnection;
export const collection = collectionModule;
export const needsAttention = needsAttentionModule;

export default {
    createConnection,
    collection,
    needsAttention
};
