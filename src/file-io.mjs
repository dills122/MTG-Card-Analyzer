import fs from "node:fs";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
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

    function CreateDirectory(callback) {
        const dirPath = path.join(deps.tempDirectory, deps.randomUUID());
        deps.fs.mkdir(dirPath, (err) => {
            if (err) {
                return callback(err);
            }
            return callback(null, dirPath);
        });
    }

    function CleanUpFiles(directory, callback) {
        const done = callback || (() => {});
        if (rimraf.length >= 2) {
            // Legacy callback API (rimraf v3)
            return rimraf(directory, done);
        }
        const result = rimraf(directory);
        if (result && typeof result.then === "function") {
            result.then(() => done()).catch((err) => done(err));
        } else {
            done();
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

export { WriteToFile, DeleteFile, CreateDirectory, CleanUpFiles, buildFileIO };
