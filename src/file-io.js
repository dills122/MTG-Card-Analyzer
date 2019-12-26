const fs = require('fs');
const {
    promisify
} = require('util');
const uuid = require('uuid/v4');
const tempDirectory = require('temp-dir');
const rimraf = require('rimraf');

const writeFile = promisify(fs.writeFile);
const unlinkFile = promisify(fs.unlink);

async function WriteToFile(contents, path = '') {
    return await writeFile(path || `${uuid()}.json`, JSON.stringify(contents));
}

async function DeleteFile(path) {
    return await unlinkFile(path);
}

function CreateDirectory(callback) {
    const dirPath = `${tempDirectory}\\${uuid()}`;
    fs.mkDir(dirPath, (err) => {
        if (err) {
            return callback(err);
        }
        return callback(null, dirPath);
    });
}

function CleanUpFiles(directory, callback) {
    rimraf(directory, (err) => {
        if (err) {
            return callback(err);
        }
        return callback();
    })
}

module.exports = {
    WriteToFile,
    DeleteFile,
    CreateDirectory,
    CleanUpFiles
}