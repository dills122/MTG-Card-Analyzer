const _ = require('lodash');
const FuzzySet = require('fuzzyset.js');
const {
    promisify
} = require('util');
const {
    GetBulkNames
} = require('../db-local/index');

const dependencies = {
    GetNames: promisify(GetBulkNames)
};

function MatchName(params) {
    _.bindAll(this, Object.keys(MatchName.prototype));
}

MatchName.prototype._filterNames = function (names) {
    return names.map((record) => {
        return record.name;
    });
}

MatchName.prototype.Match = async function (cleanText, dirtyText = '') {
    let names = await dependencies.GetNames();
    let filteredNames = this._filterNames(names);
    let fuzzy = FuzzySet(filteredNames);
    return fuzzy.get(cleanText);
}

module.exports = {
    create: function (params) {
        return new MatchName(params);
    },
    dependencies
};