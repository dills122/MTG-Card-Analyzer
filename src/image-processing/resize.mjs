import _ from "lodash";
import jimp from "jimp";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { GetImageDimensions } from "./util.mjs";

const constants = {
    name: {
        heightPercent: 0.0585,
        widthPercent: 0.755
    },
    type: {
        topPercent: 0.555,
        heightPercent: 0.075,
        widthPercent: 0.725
    },
    art: {
        topPercent: 0.1122,
        heightPercent: 0.4455,
        widthPercent: 0.8557
    },
    flavor: {
        topPercent: 0.6127,
        heightPercent: 0.2927,
        widthPercent: 0.8557
    },
    borderPercent: 0.0535
};

async function GetImageSnippet(imgPath, type) {
    const dimensions = await GetImageDimensions(imgPath);
    if (dimensions.width >= 360 && dimensions.height >= 500) {
        const alteredDimensions = GetAlteredDimensions(dimensions, type);
        const img = await jimp.read(imgPath);
        img.crop(
            alteredDimensions.left,
            alteredDimensions.top,
            alteredDimensions.width,
            alteredDimensions.height
        )
            .greyscale()
            .contrast(0.73)
            .brightness(0.235)
            .blur(1);
        const imgBuffer = await img.getBufferAsync("image/jpeg");
        return imgBuffer;
    }
    throw new Error("Image is to small");
}

async function GetImageSnippetFile(imgPath, type) {
    const ext = path.extname(imgPath) || ".jpg";
    const filePath = `${randomUUID()}${ext}`;
    const dimensions = await GetImageDimensions(imgPath);
    if (dimensions.width >= 360 && dimensions.height >= 500) {
        const alteredDimensions = GetAlteredDimensions(dimensions, type);
        let img = await jimp.read(imgPath);
        img = cropper(img, alteredDimensions, type);
        await img.writeAsync(filePath);
        return filePath;
    }
    throw new Error("Image is to small");
}

async function GetImageSnippetTmpFile(imgPath, directory, type) {
    const ext = path.extname(imgPath) || ".jpg";
    const filePath = path.join(directory, `${randomUUID()}${ext}`);
    const dimensions = await GetImageDimensions(imgPath);
    if (dimensions.width >= 360 && dimensions.height >= 500) {
        const alteredDimensions = GetAlteredDimensions(dimensions, type);
        let img = await jimp.read(imgPath);
        img = cropper(img, alteredDimensions, type);
        await img.writeAsync(filePath);
        return filePath;
    }
    throw new Error("Image is to small");
}

function GetAlteredDimensions(dimensions, type) {
    if (type === "name") {
        return {
            width: _.round(dimensions.width * constants.name.widthPercent),
            height: _.round(dimensions.height * constants.name.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.borderPercent)
        };
    }
    if (type === "type") {
        return {
            width: _.round(dimensions.width * constants.type.widthPercent),
            height: _.round(dimensions.height * constants.type.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.type.topPercent)
        };
    }
    if (type === "art") {
        return {
            width: _.round(dimensions.width * constants.art.widthPercent),
            height: _.round(dimensions.height * constants.art.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.art.topPercent)
        };
    }
    if (type === "flavor") {
        return {
            width: _.round(dimensions.width * constants.flavor.widthPercent),
            height: _.round(dimensions.height * constants.flavor.heightPercent),
            left: _.round(dimensions.width * constants.borderPercent),
            top: _.round(dimensions.height * constants.flavor.topPercent)
        };
    }
    return {};
}

function cropper(img, dimensions, type) {
    if (type !== "art" || type !== "flavor") {
        return img
            .crop(dimensions.left, dimensions.top, dimensions.width, dimensions.height)
            .greyscale()
            .contrast(0.73)
            .brightness(0.235)
            .blur(1);
    }
    return img
        .crop(dimensions.left, dimensions.top, dimensions.width, dimensions.height)
        .contrast(0.73)
        .brightness(0.235)
        .blur(1);
}

export { GetImageSnippet, GetImageSnippetFile, GetImageSnippetTmpFile };

export default {
    GetImageSnippet,
    GetImageSnippetFile,
    GetImageSnippetTmpFile
};
