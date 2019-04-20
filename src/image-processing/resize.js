const _ = require('lodash');
const sharp = require('sharp');
const {
    GetImageDimensions
} = require('./util');
const {
    Write
} = require('../file-io');

const constants = {
    name: {
        heightPercent: .12,
        widthPercent: .80,
    },
    type: {
        topPercent: .55,
        heightPercent: .12,
        widthPercent: .82,
    },
    borderPercent: .035
};

async function GetImageSnippet(imgPath, type) {
    let dimensions = await GetImageDimensions(imgPath);
    let alteredDimensions = GetAlteredDimensions(dimensions, type);
    let imgBuffer = sharp(imgPath)
        .extract(alteredDimensions)
        .toBuffer();
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