const _ = require('lodash');
const jimp = require('jimp');
const uuid = require('uuid/v4');
const {
    GetImageDimensions
} = require('./util');

const constants = {
    name: {
        heightPercent: .0825,
        widthPercent: .755,
    },
    type: {
        topPercent: .555,
        heightPercent: .075,
        widthPercent: .725,
    },
    borderPercent: .035
};

async function GetImageSnippet(imgPath, type) {
    let dimensions = await GetImageDimensions(imgPath);
    if (dimensions.width >= 360 && dimensions.height >= 500) {
        let alteredDimensions = GetAlteredDimensions(dimensions, type);
        let img = await jimp.read(imgPath);
        img.crop(alteredDimensions.left, alteredDimensions.top, alteredDimensions.width, alteredDimensions.height)
            .greyscale()
            .brightness(.225)
            .contrast(.725)
            .blur(1);
        let imgBuffer = await img.getBufferAsync("image/jpeg");
        return imgBuffer;
    }
    throw new Error("Image is to small");
}

async function GetImageSnippetFile(imgPath, type) {
    let path = `${uuid()}.${imgPath.split('.')[1] || '.jpg'}`;
    let dimensions = await GetImageDimensions(imgPath);
    if (dimensions.width >= 360 && dimensions.height >= 500) {
        let alteredDimensions = GetAlteredDimensions(dimensions, type);
        let img = await jimp.read(imgPath);
        img.crop(alteredDimensions.left, alteredDimensions.top, alteredDimensions.width, alteredDimensions.height)
            .greyscale()
            .brightness(.225)
            .contrast(.725)
            .blur(1);
        await img.writeAsync(path);
        return path;
    }
    throw new Error("Image is to small");
}

function GetAlteredDimensions(dimensions, type) {
    if (type === 'name') {
        return {
            width: _.round(dimensions.width * constants.name.widthPercent),
            height: _.round(dimensions.height * constants.name.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.borderPercent)
        };
    } else if (type === 'type') {
        return {
            width: _.round(dimensions.width * constants.type.widthPercent),
            height: _.round(dimensions.height * constants.type.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.type.topPercent)
        };
    } else {
        return {};
    }
}

module.exports = {
    GetImageSnippet,
    GetImageSnippetFile
}