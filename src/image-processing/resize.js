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
        heightPercent: .10,
        widthPercent: .78,
    },
    type: {
        topPercent: .555,
        heightPercent: .08,
        widthPercent: .78,
    },
    borderPercent: .035
};

async function GetImageSnippet(imgPath, type) {
    let dimensions = await GetImageDimensions(imgPath);
    let alteredDimensions = GetAlteredDimensions(dimensions, type);
    let imgBuffer = sharp(imgPath)
        .extract(alteredDimensions)
        .toBuffer();
        //Used to generate the images on the ReadMe
        // .toFile(`${uuid()}.${imgPath.split('.')[1] || 'jpg'}`);
    return imgBuffer;
}

function GetAlteredDimensions(dimensions, type) {
    if(type === 'name') {
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
    GetImageSnippet
}