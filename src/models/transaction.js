const _ = require('lodash');
const schema = require('./schemas/transaction.schema').schema;
// const {
//     Transaction
// } = require('../rds/index');

function Transaction() {
    _.bindAll(this, Object.keys(Transaction.prototype));
}

Transaction.prototype.initiate = function (obj) {
    if (_.isNull(obj)) {
        return {
            error: "Object null"
        };
    }
    let { error: hasError } = !schema.validate(params);
    if (!hasError) {
        this.data = obj;
    }
    return isValid;
};

Transaction.prototype.CheckSchema = function () {
    return !schema.validate(this.data).error;
}

Transaction.prototype.Insert = function () {
    if (this.CheckSchema && !_.isNull(this.data)) {
        // Transaction.InsertEntity(this.data);
    }
}

module.exports = {
    create: function (params) {
        return new Transaction(params);
    },
};