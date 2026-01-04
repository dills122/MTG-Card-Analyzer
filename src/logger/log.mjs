import _ from "lodash";
import bunyan from "bunyan";

class Logger {
    constructor(params = {}) {
        _.bindAll(this, Object.keys(Logger.prototype));
        this.isPretty = params.isPretty ?? true;
        if (this.isPretty) {
            this.bunyan = bunyan.createLogger({
                level: 4,
                name: "MTG-Processor"
            });
        }
    }

    info(message, object) {
        if (this.bunyan) {
            this.bunyan.info(`${message}`);
            if (object) {
                this.bunyan.info(object);
            }
            return;
        }
        console.log(message);
        if (object) {
            console.log(JSON.stringify(object, null, 4));
        }
    }

    warn(message, object) {
        if (this.bunyan) {
            this.bunyan.warn(`${message}`);
            if (object) {
                this.bunyan.warn(object);
            }
            return;
        }
        console.warn(message);
        if (object) {
            console.warn(JSON.stringify(object, null, 4));
        }
    }

    error(message, object) {
        if (this.bunyan) {
            this.bunyan.error(`${message}`);
            if (object) {
                this.bunyan.error(object);
            }
            return;
        }
        console.error(message);
        if (object) {
            console.error(JSON.stringify(object, null, 4));
        }
    }
}

export const create = (params) => new Logger(params);

export { Logger };

export default {
    create,
    Logger
};
