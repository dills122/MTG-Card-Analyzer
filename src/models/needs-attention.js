const _ = require('lodash');
const Joi = require('@hapi/joi');
const schema = require('./schemas/needs-attention.schema').schema;
const {
    NDAttn
} = require('../rds/index');
const dependencies = {

};

function NeedsAttention(params) {
    _.bindAll(this, Object.keys(NeedsAttention.prototype));
}

NeedsAttention.prototype.initiate = function (obj) {
    if (_.isNull(obj)) {
        return {
            error: "Object null"
        };
    }
    let isValid = !!!Joi.validate(obj, schema).error;
    if (isValid) {
        this.data = obj;
    }
    return isValid;
};

NeedsAttention.prototype.CheckSchema = function () {
    return !!!Joi.validate(this.data, schema).error;
}

NeedsAttention.prototype.Insert = function () {
    if (this.CheckSchema && !_.isNull(this.data)) {
        NDAttn.InsertEntity(this.data, (err, records) => console.log(err || records));
    }
}

module.exports = {
    create: function (params) {
        return new NeedsAttention(params);
    },
    dependencies
};