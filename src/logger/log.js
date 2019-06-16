const _ = require('lodash');
const bunyan = require('bunyan');
function Logger(params) {
    _.bindAll(this, Object.keys(Logger.prototype));
    this.isPretty = params.isPretty || true;
    if(this.isPretty) {
        this.bunyan = bunyan.createLogger({
            level: 4,
            name: 'MTG-Processor'
        });
    }
}

Logger.prototype.info = function(message, object) {
    if(this.bunyan) {
        this.bunyan.info(`${message}`);
        if(object) {
            this.bunyan.info(object);
        }
        return;
    }
    console.log(message);
    if(object) {
        console.log(JSON.stringify(object,null, 4));
    }
};
Logger.prototype.warn = function(message, object) {
    if(this.bunyan) {
        this.bunyan.warn(`${message}`);
        if(object) {
            this.bunyan.warn(object);
        }
        return;
    }
    console.warn(message);
    if(object) {
        console.warn(JSON.stringify(object,null, 4));
    }
};

Logger.prototype.error = function(message, object) {
    if(this.bunyan) {
        this.bunyan.error(`${message}`);
        if(object) {
            this.bunyan.error(object);
        }
        return;
    }
    console.error(message);
    if(object) {
        console.error(JSON.stringify(object,null, 4));
    }
};

module.exports = {
    create: function (params) {
        return new Logger(params);
    }
}