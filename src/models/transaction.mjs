import _ from "lodash";
import schemaModule from "./schemas/transaction.schema.mjs";

const { schema } = schemaModule;
// const { Transaction } = require('../rds/index');

function Transaction() {
    _.bindAll(this, Object.keys(Transaction.prototype));
}

Transaction.prototype.initiate = function (obj) {
    if (_.isNull(obj)) {
        return {
            error: "Object null"
        };
    }
    const { error: hasError } = !schema.validate(obj);
    if (hasError) return false;
    this.data = obj;
};

Transaction.prototype.CheckSchema = function () {
    return !schema.validate(this.data).error;
};

Transaction.prototype.Insert = function () {
    if (this.CheckSchema && !_.isNull(this.data)) {
        // Transaction.InsertEntity(this.data);
    }
};

const create = (params) => new Transaction(params);

export { create, Transaction };

export default {
    create
};
