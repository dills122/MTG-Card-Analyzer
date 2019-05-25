const fs = require('fs');
const {promisify} = require('util');
const uuid = require('uuid/v4');

const writeFile = promisify(fs.writeFile);

async function Write(imgBuffer, imgPath) {
    let editedImgPath = `${uuid}.${imgPath.split('.')[1] || 'jpg'}`;
    return await writeFile(editedImgPath, imgBuffer);
}

async function WriteToFile(contents, path ='') {
    return await writeFile(path || `${uuid()}.json`,JSON.stringify(contents));
}

module.exports = {
    Write,
    WriteToFile
}