const _ = require('lodash');
const jimp = require('jimp');
const uuid = require('uuid/v4');
const {
    GetImageDimensions
} = require('./util');

const constants = {
    name: {
        heightPercent: .0585,
        widthPercent: .755,
    },
    type: {
        topPercent: .555,
        heightPercent: .075,
        widthPercent: .725,
    },
    art: {
        topPercent: .1122,
        heightPercent: .4455,
        widthPercent: .8557,
    },
    flavor: {
        topPercent: .6127,
        heightPercent: .2927,
        widthPercent: .8557
    },
    borderPercent: .0535
};

async function GetImageSnippet(imgPath, type) {
    let dimensions = await GetImageDimensions(imgPath);
    if (dimensions.width >= 360 && dimensions.height >= 500) {
        let alteredDimensions = GetAlteredDimensions(dimensions, type);
        let img = await jimp.read(imgPath);
        img.crop(alteredDimensions.left, alteredDimensions.top, alteredDimensions.width, alteredDimensions.height)
            .greyscale()
            .contrast(.730)
            .brightness(.235)
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
        img = cropper(img, alteredDimensions, type);
        await img.writeAsync(path);
        return path;
    }
    throw new Error("Image is to small");
}

async function GetImageSnippetTmpFile(imgPath, directory, type) {
    let path = `${directory}\\${uuid()}.${imgPath.split('.')[1] || '.jpg'}`;
    let dimensions = await GetImageDimensions(imgPath);
    if (dimensions.width >= 360 && dimensions.height >= 500) {
        let alteredDimensions = GetAlteredDimensions(dimensions, type);
        let img = await jimp.read(imgPath);
        img = cropper(img, alteredDimensions, type);
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
    } else if (type === 'art') {
        return {
            width: _.round(dimensions.width * constants.art.widthPercent),
            height: _.round(dimensions.height * constants.art.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.art.topPercent)
        };
    } else if (type === 'flavor') {
        return {
            width: _.round(dimensions.width * constants.flavor.widthPercent),
            height: _.round(dimensions.height * constants.flavor.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.flavor.topPercent)
        };
    } else {
        return {};
    }
}

function cropper(img, dimensions, type) {
    if (type !== 'art' || type !== 'flavor') {
        return img.crop(dimensions.left, dimensions.top, dimensions.width, dimensions.height)
            .greyscale()
            .contrast(.730)
            .brightness(.235)
            .blur(1);
    } else {
        return img.crop(dimensions.left, dimensions.top, dimensions.width, dimensions.height)
            .contrast(.730)
            .brightness(.235)
            .blur(1);
    }
}

module.exports = {
    GetImageSnippet,
    GetImageSnippetFile,
    GetImageSnippetTmpFile
}