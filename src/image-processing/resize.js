const _ = require('lodash');
const sharp = require('sharp');
const uuid = require('uuid/v4');
const {
    GetImageDimensions
} = require('./util');
const {
    Write
} = require('../file-io');

const constants = {
    name: {
        heightPercent: .09,
        widthPercent: .78,
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
    let alteredDimensions = GetAlteredDimensions(dimensions, type);
    let imgBuffer = sharp(imgPath)
        .extract(alteredDimensions)
        .greyscale()
        .sharpen()
        .blur(.8)
        .gamma()
        .normalise()
        .toBuffer();
    return imgBuffer;
}

async function GetImageSnippetFile(imgPath, type) {
    let path = `${uuid()}.${imgPath.split('.')[1] || '.jpg'}`;
    let dimensions = await GetImageDimensions(imgPath);
    if (dimensions.width >= 360 && dimensions.height >= 500) {
        let alteredDimensions = GetAlteredDimensions(dimensions, type);
        await sharp(imgPath)
            .extract(alteredDimensions)
            .greyscale()
            .sharpen()
            .blur(.8)
            .gamma()
            .normalise()
            .toFile(path);
        return path;
    }
    throw "Image is to small";
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