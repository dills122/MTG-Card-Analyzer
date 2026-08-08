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
    const mkdir = deps.promisify(deps.fs.mkdir);

    async function writeToFile(contents, filePath = "") {
        return writeFile(filePath || `${deps.randomUUID()}.json`, JSON.stringify(contents));
    }

    async function deleteFile(filePath) {
        return unlinkFile(filePath);
    }

    async function createDirectory() {
        const dirPath = path.join(deps.tempDirectory, deps.randomUUID());
        await mkdir(dirPath);
        return dirPath;
    }

    async function cleanUpFiles(directory) {
        return rm(directory, { recursive: true, force: true });
    }

    return {
        writeToFile,
        deleteFile,
        createDirectory,
        cleanUpFiles
    };
}

const { writeToFile, deleteFile, createDirectory, cleanUpFiles } = buildFileIO();

export default {
    writeToFile,
    deleteFile,
    createDirectory,
    cleanUpFiles,
    buildFileIO
};

export { buildFileIO, cleanUpFiles, createDirectory, deleteFile, writeToFile };
