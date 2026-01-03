const fs = require("fs");
const { promisify } = require("util");
const { randomUUID } = require("crypto");
const tempDirectory = require("os").tmpdir();
const rimrafLib = require("rimraf");
const path = require("path");

const writeFile = promisify(fs.writeFile);
const unlinkFile = promisify(fs.unlink);
const rimraf = rimrafLib.rimraf || rimrafLib;

async function WriteToFile(contents, path = "") {
    return await writeFile(path || `${randomUUID()}.json`, JSON.stringify(contents));
}

async function DeleteFile(path) {
    return await unlinkFile(path);
}

function CreateDirectory(callback) {
    const dirPath = path.join(tempDirectory, randomUUID());
    fs.mkdir(dirPath, (err) => {
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
    } else {
        // Promise API (rimraf v4+)
        const result = rimraf(directory);
        if (result && typeof result.then === "function") {
            result.then(() => done()).catch((err) => done(err));
        } else {
            done();
        }
    }
}

module.exports = {
    WriteToFile,
    DeleteFile,
    CreateDirectory,
    CleanUpFiles
};
