import { inspect } from "node:util";

const LEVEL_COLORS = {
    info: "\u001b[36m",
    warn: "\u001b[33m",
    error: "\u001b[31m"
};
const COLOR_RESET = "\u001b[0m";

class Logger {
    constructor(params = {}) {
        this.isPretty = params.isPretty ?? true;
        this.sink = params.sink || console;
        this.colors =
            params.colors ??
            (this.isPretty &&
                this.sink === console &&
                Boolean(process.stdout.isTTY) &&
                process.env.NO_COLOR === undefined);
    }

    info(message, object) {
        this.#write("info", "log", message, object);
    }

    warn(message, object) {
        this.#write("warn", "warn", message, object);
    }

    error(message, object) {
        this.#write("error", "error", message, object);
    }

    output(message) {
        this.sink.log(message);
    }

    #write(level, method, message, object) {
        if (!this.isPretty) {
            this.sink[method](message);
            if (object !== undefined) {
                this.sink[method](JSON.stringify(object, null, 4));
            }
            return;
        }

        const label = level.toUpperCase().padEnd(5);
        const renderedLabel = this.colors ? `${LEVEL_COLORS[level]}${label}${COLOR_RESET}` : label;
        const renderedMessage = message instanceof Error ? message.message : String(message);
        let output = `${renderedLabel} ${renderedMessage}`;
        if (object !== undefined) {
            const details = inspect(object, {
                colors: this.colors,
                depth: 5,
                breakLength: 100,
                compact: false
            })
                .split("\n")
                .map((line) => `      ${line}`)
                .join("\n");
            output += `\n${details}`;
        }
        this.sink[method](output);
    }
}

export const create = (params) => new Logger(params);

export { Logger };

export default {
    create,
    Logger
};
