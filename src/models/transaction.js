const _ = require('lodash');
const Joi = require('@hapi/joi');
const schema = require('./schemas/transaction.schema').schema;
// const {
//     Transaction
// } = require('../rds/index');

function Transaction() {
    _.bindAll(this, Object.keys(Transaction.prototype));
}

Transaction.prototype.initiate = function(obj) {
    if(_.isNull(obj)) {
        return {
            error: "Object null"
        };
    }
    let isValid = !Joi.validate(obj, schema).error;
    if(isValid) {
        this.data = obj;
    }
    return isValid;
};

Transaction.prototype.CheckSchema = function() {
    return !Joi.validate(this.data, schema).error;
}

Transaction.prototype.Insert = function() {
    if(this.CheckSchema && !_.isNull(this.data)) {
        // Transaction.InsertEntity(this.data);
    }
}

module.exports = {
    create:function(params) {
        return new Transaction(params);
    },
};