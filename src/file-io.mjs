import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const defaultDeps = {
    fs,
    promisify,
    randomUUID,
    tempDirectory: os.tmpdir()
};

function buildFileIO(deps = defaultDeps) {
    const writeFile = deps.promisify(deps.fs.writeFile);
    const unlinkFile = deps.promisify(deps.fs.unlink);
    const rm = deps.promisify(deps.fs.rm);

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
        return rm(directory, { recursive: true, force: true });
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
