import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { rimraf as rimrafFn } from "rimraf";

const defaultDeps = {
    fs,
    promisify,
    randomUUID,
    tempDirectory: os.tmpdir(),
    rimrafLib: { rimraf: rimrafFn }
};

function buildFileIO(deps = defaultDeps) {
    const writeFile = deps.promisify(deps.fs.writeFile);
    const unlinkFile = deps.promisify(deps.fs.unlink);
    const rimraf = deps.rimrafLib.rimraf || deps.rimrafLib;

    async function WriteToFile(contents, filePath = "") {
        return writeFile(filePath || `${deps.randomUUID()}.json`, JSON.stringify(contents));
    }

    async function DeleteFile(filePath) {
        return unlinkFile(filePath);
    }

    async function CreateDirectory() {
        const dirPath = path.join(deps.tempDirectory, deps.randomUUID());
        await new Promise((resolve, reject) => {
            deps.fs.mkdir(dirPath, (err) => {
                if (err) {
                    return reject(err);
                }
                return resolve();
            });
        });
        return dirPath;
    }

    async function CleanUpFiles(directory) {
        if (deps.rimrafLib && deps.rimrafLib.rimraf) {
            await deps.rimrafLib.rimraf(directory);
            return;
        }
        if (typeof rimraf === "function" && rimraf.length >= 2) {
            await new Promise((resolve, reject) => {
                rimraf(directory, (err) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve();
                });
            });
            return;
        }
        const result = rimraf(directory);
        if (result && typeof result.then === "function") {
            await result;
            return;
        }
    }

    return {
        WriteToFile,
        DeleteFile,
        CreateDirectory,
        CleanUpFiles
    };
}

const { WriteToFile, DeleteFile, CreateDirectory, CleanUpFiles } = buildFileIO();

export default {
    WriteToFile,
    DeleteFile,
    CreateDirectory,
    CleanUpFiles,
    buildFileIO
};

export { buildFileIO, CleanUpFiles, CreateDirectory, DeleteFile, WriteToFile };
