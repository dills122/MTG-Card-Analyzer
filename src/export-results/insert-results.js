const {
    CreateCollection: CreateModel,
} = require('../models/collection-item');
const {
    CreateNeedsAttn: CreateModel,
} = require('../models/needs-attention');
const {
    InsertCollection: InsertEntity
} = require('../rds/collection');
const {
    InsertNeedsAttn: InsertEntity
} = require('../rds/needs-attention');


function InsertResults(results) {
    if(!results) {
        return {
            error: "Empty object"
        };
    }
}