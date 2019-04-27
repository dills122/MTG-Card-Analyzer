const _ = require('lodash');
const {
    Collection
} = require('../rds/index');
const {
    GatherInfo
} = require('./compile-results');

function ExportResults(params) {
    this.name = params.name;
    this.set = params.set || '';
}

ExportResults.prototype.execute = function (cb) {
    if (this.set) {
        Collection.GetQuantity(this.name, this.set, (results) => {
            this.quantity = results || 0;
            if(results > 0) {
                return cb({
                    type: 'Update'
                });
            } else {
                return cb({
                    type: 'Insert'
                });
            }
        });
    }

    GatherInfo(this.name).then((results) => {
        if (results.error) {
            throw error;
        }
        if (results.set) {
            this.type = results.type;
            this.set = results.set;
            return cb({
                type: 'Collection'
            });
        }
        if (results.sets) {
            this.sets = results.sets;
            return cb({
                type: 'Needs_Attn'
            });
        }
    })
};

ExportResults.prototype.InsertCollection = function() {

};

ExportResults.prototype.UpdateCollection = function() {

};

ExportResults.prototype.InsertNeedsAttentionSet = function() {

};

module.exports = {
    create: function (params) {
        return new ExportResults(params);
    }
}