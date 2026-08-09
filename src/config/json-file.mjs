import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MAX_JSON_BYTES = 1024 * 1024;

function readJsonFile(
    filePath,
    { allowMissing = false, label = "JSON file", maxBytes = DEFAULT_MAX_JSON_BYTES } = {}
) {
    let stats;
    try {
        stats = fs.statSync(filePath);
    } catch (error) {
        if (allowMissing && error?.code === "ENOENT") {
            return {};
        }
        throw new Error(`${label} at "${filePath}" could not be read: ${error?.message}`, {
            cause: error
        });
    }
    if (!stats.isFile()) {
        throw new Error(`${label} at "${filePath}" could not be read: not a regular file`);
    }
    if (stats.size > maxBytes) {
        throw new Error(
            `${label} at "${filePath}" exceeds the ${maxBytes}-byte size limit (${stats.size} bytes)`
        );
    }

    let raw;
    try {
        raw = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        throw new Error(`${label} at "${filePath}" could not be read: ${error?.message}`, {
            cause: error
        });
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new Error(`${label} at "${filePath}" is not valid JSON: ${error?.message}`, {
            cause: error
        });
    }
}

function writeJsonFileAtomic(filePath, value, { label = "JSON file" } = {}) {
    const directory = path.dirname(filePath);
    const temporaryPath = path.join(
        directory,
        `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
    );
    fs.mkdirSync(directory, { recursive: true });
    try {
        fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 4)}\n`);
        fs.renameSync(temporaryPath, filePath);
    } catch (error) {
        fs.rmSync(temporaryPath, { force: true });
        throw new Error(`${label} at "${filePath}" could not be written: ${error?.message}`, {
            cause: error
        });
    }
}

export { DEFAULT_MAX_JSON_BYTES, readJsonFile, writeJsonFileAtomic };

export default { readJsonFile, writeJsonFileAtomic };
