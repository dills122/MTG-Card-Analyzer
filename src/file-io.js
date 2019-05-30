const fs = require('fs');
const {
    promisify
} = require('util');
const uuid = require('uuid/v4');
const tempDirectory = require('temp-dir');

const writeFile = promisify(fs.writeFile);
const unlinkFile = promisify(fs.unlink);
const mkDir = promisify(fs.mkdir);

async function Write(imgBuffer, imgPath) {
    let editedImgPath = `${uuid()}.${imgPath.split('.')[1] || 'jpg'}`;
    return await writeFile(editedImgPath, imgBuffer);
}

async function WriteTmp(imgBuffer, directory) {
    let editedImgPath = `${directory}\\${uuid()}.jpg`;
    await writeFile(editedImgPath, imgBuffer);
    return editedImgPath;
}

async function WriteToFile(contents, path = '') {
    return await writeFile(path || `${uuid()}.json`, JSON.stringify(contents));
}

async function DeleteFile(path) {
    return await unlinkFile(path);
}

async function DeleteFiles(paths) {
    for(let i = 0; i < paths.length; i++) {
        await unlinkFile(paths[i]);
    }
}

async function CreateDirectory() {
    const dirPath = `${tempDirectory}\\${uuid()}`;
    await mkDir(dirPath);
    return dirPath;
}

module.exports = {
    Write,
    WriteToFile,
    WriteTmp,
    DeleteFile,
    DeleteFiles,
    CreateDirectory
}