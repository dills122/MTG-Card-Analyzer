import bunyan from "bunyan";

// Methods are arrow-function class fields (not prototype methods) so they stay bound to the
// instance when passed around detached -- e.g. `const log = logger.info` -- without needing a
// separate bind step in the constructor.
class Logger {
    constructor(params = {}) {
        this.isPretty = params.isPretty ?? true;
        if (this.isPretty) {
            this.bunyan = bunyan.createLogger({
                level: 4,
                name: "MTG-Processor"
            });
        }
    }

    info = (message, object) => {
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
    };

    warn = (message, object) => {
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
    };

    error = (message, object) => {
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
    };
}

export const create = (params) => new Logger(params);

export { Logger };

export default {
    create,
    Logger
};
