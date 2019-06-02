const fs = require('fs');
const {
    promisify
} = require('util');
const uuid = require('uuid/v4');
const tempDirectory = require('temp-dir');

const writeFile = promisify(fs.writeFile);
const unlinkFile = promisify(fs.unlink);
const mkDir = promisify(fs.mkdir);

async function WriteToFile(contents, path = '') {
    return await writeFile(path || `${uuid()}.json`, JSON.stringify(contents));
}

async function DeleteFile(path) {
    return await unlinkFile(path);
}

async function CreateDirectory() {
    const dirPath = `${tempDirectory}\\${uuid()}`;
    await mkDir(dirPath);
    return dirPath;
}

module.exports = {
    WriteToFile,
    DeleteFile,
    CreateDirectory
}