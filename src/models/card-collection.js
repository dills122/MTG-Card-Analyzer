const _ = require('lodash');
const Joi = require('@hapi/joi');
const schema = require('./schemas/card-collection.schema').schema;
const {
    Collection
} = require('../rds/index');
const dependencies = {

};

function CardCollection(params) {
    _.bindAll(this, Object.keys(CardCollection.prototype));
}

CardCollection.prototype.initiate = function(obj) {
    if(_.isNull(obj)) {
        return {
            error: "Object null"
        };
    }
    let validation = Joi.validate(obj, schema).error;
    let isValid = !!!validation;
    if(isValid) {
        this.data = obj;
    }
    console.log(validation);
    return isValid;
};

CardCollection.prototype.CheckSchema = function() {
    return !!!Joi.validate(this.data, schema).error;
}

CardCollection.prototype.Insert = function() {
    if(this.CheckSchema && !_.isNull(this.data)) {
        Collection.InsertEntity(this.data);
    }
}

module.exports = {
    create:function(params) {
        return new CardCollection(params);
    },
    dependencies
};