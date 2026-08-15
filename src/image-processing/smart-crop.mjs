import { randomUUID } from "node:crypto";
import path from "node:path";
import { readImage } from "./util.mjs";
import { round, clamp } from "../util.mjs";

// Crop geometry is part of a fingerprint's meaning. Bump this value whenever set-symbol
// normalization changes so cached hashes from incompatible crop algorithms are never compared.
const setSymbolHashMode = "set-symbol-content-v1";

// Reusable region registry -- the shared "layer" every crop spot plugs into. setSymbol feeds the
// image-fingerprint path; name/type/rules-name/default feed OCR (region templates, one or more crop
// candidates per type -- ocr-preprocessing.mjs runs each through its own pixel preprocessing and
// picks the best result after real OCR scoring, so these carry no confidence heuristic here).
const regions = {
    setSymbol: {
        leftPercent: 0.78,
        topPercent: 0.535,
        widthPercent: 0.13,
        heightPercent: 0.1
    },
    // The symbol detector searches a wider area than the legacy crop above, then reduces that
    // search window to the detected icon plus an even buffer. Keeping the expected symbol region
    // separate gives the detector a stable center to prefer without assuming every frame puts the
    // icon at exactly the same pixels.
    setSymbolSearch: {
        leftPercent: 0.72,
        topPercent: 0.515,
        widthPercent: 0.24,
        heightPercent: 0.14
    },
    name: [
        {
            key: "name-core",
            leftPercent: 0.08,
            topPercent: 0.05,
            widthPercent: 0.78,
            heightPercent: 0.065,
            psm: "line"
        },
        {
            key: "name-wide",
            leftPercent: 0.05,
            topPercent: 0.045,
            widthPercent: 0.9,
            heightPercent: 0.08,
            psm: "line"
        },
        {
            key: "top-band",
            leftPercent: 0.05,
            topPercent: 0.03,
            widthPercent: 0.9,
            heightPercent: 0.12,
            psm: "block"
        },
        {
            key: "name-full",
            leftPercent: 0.015,
            topPercent: 0.02,
            widthPercent: 0.97,
            heightPercent: 0.14,
            psm: "block"
        }
    ],
    type: [
        {
            key: "type-core",
            leftPercent: 0.08,
            topPercent: 0.565,
            widthPercent: 0.78,
            heightPercent: 0.08,
            psm: "line"
        },
        {
            key: "type-wide",
            leftPercent: 0.05,
            topPercent: 0.54,
            widthPercent: 0.9,
            heightPercent: 0.1,
            psm: "block"
        },
        {
            key: "lower-band",
            leftPercent: 0.05,
            topPercent: 0.6,
            widthPercent: 0.9,
            heightPercent: 0.14,
            psm: "sparse"
        }
    ],
    "rules-name": [
        {
            key: "rules-name",
            leftPercent: 0.055,
            topPercent: 0.57,
            widthPercent: 0.89,
            heightPercent: 0.31,
            psm: "block",
            mode: "soft"
        }
    ],
    default: [
        {
            key: "top-strip",
            leftPercent: 0.05,
            topPercent: 0.05,
            widthPercent: 0.9,
            heightPercent: 0.15,
            psm: "block"
        },
        {
            key: "bottom-strip",
            leftPercent: 0.05,
            topPercent: 0.75,
            widthPercent: 0.9,
            heightPercent: 0.2,
            psm: "sparse"
        }
    ]
};

regions["soft-name"] = regions.name.flatMap((template) => [
    {
        ...template,
        key: `${template.key}-soft`,
        mode: "soft",
        psm: template.key === "name-wide" ? "raw-line" : template.psm
    },
    {
        ...template,
        key: `${template.key}-soft-inverted`,
        mode: "soft-inverted",
        psm: template.key === "name-wide" ? "raw-line" : template.psm
    }
]);

// OCR types without a dedicated table (or unrecognized types) fall back to the default bands.
function getRegionTemplates(type) {
    return regions[type] || regions.default;
}

const config = {
    minSourceWidth: 360,
    minSourceHeight: 500,
    // A source below the standard minimum but within this factor of it is still treated as
    // recoverable for OCR (see assertOcrSourceSizeOk) -- anything further out is degenerate/
    // unreadable rather than merely low-resolution.
    maxRecoverableUpscaleFactor: 2,
    // Greyscale luminance std-dev (0-255) below this reads as a near-uniform-color crop (solid
    // card border/background instead of a real set-symbol icon).
    lowConfidenceStdDevThreshold: 10,
    // Edge detection always runs on a bounded analysis image, even for the maximum accepted input.
    // The final crop still comes from the original-resolution source.
    maxEdgeAnalysisWidth: 480,
    maxEdgeAnalysisHeight: 240,
    maxEdgeAnalysisPixels: 115_200,
    minimumEdgeStrength: 18
};

function assertSourceSizeOk(dimensions) {
    if (dimensions.width < config.minSourceWidth || dimensions.height < config.minSourceHeight) {
        throw new Error("Image is to small");
    }
}

function computeSourceUpscaleFactor(dimensions) {
    return Math.max(
        1,
        config.minSourceWidth / dimensions.width,
        config.minSourceHeight / dimensions.height
    );
}

/**
 * OCR-specific sizing gate (GitHub issue #156). Unlike assertSourceSizeOk's hard cutoff --
 * used for set-symbol image-fingerprint crops, where a soft/undersized crop actively hurts hash
 * comparison -- every OCR crop is upscaled to a fixed minimum width by padAndScale
 * (see binarize.mjs) regardless of source resolution. So a source that's merely somewhat
 * under the standard minimum can still reach OCR instead of being rejected outright; only a
 * source too small/degraded to trust at all (further than maxRecoverableUpscaleFactor out)
 * is still rejected.
 * @param {{width: number, height: number}} dimensions
 * @returns {{upscaleFactor: number, upscaled: boolean}}
 */
function assertOcrSourceSizeOk(dimensions) {
    const upscaleFactor = computeSourceUpscaleFactor(dimensions);
    if (upscaleFactor > config.maxRecoverableUpscaleFactor) {
        throw new Error("Image is to small");
    }
    return { upscaleFactor, upscaled: upscaleFactor > 1 };
}

/**
 * Crop a jimp image to a named region's percent-based geometry. Pure -- clones rather than
 * mutating the caller's image.
 */
function cropRegion(img, percents) {
    const { width, height } = img.bitmap;
    const left = clamp(round(width * percents.leftPercent), 0, width - 1);
    const top = clamp(round(height * percents.topPercent), 0, height - 1);
    const cropWidth = clamp(round(width * percents.widthPercent), 1, width - left);
    const cropHeight = clamp(round(height * percents.heightPercent), 1, height - top);
    const region = { left, top, width: cropWidth, height: cropHeight };
    return {
        image: img.clone().crop({
            x: region.left,
            y: region.top,
            w: region.width,
            h: region.height
        }),
        region
    };
}

function resizeForEdgeAnalysis(img) {
    const { width, height } = img.bitmap;
    const scale = Math.min(
        1,
        config.maxEdgeAnalysisWidth / width,
        config.maxEdgeAnalysisHeight / height,
        Math.sqrt(config.maxEdgeAnalysisPixels / (width * height))
    );
    if (scale >= 1) {
        return img.clone();
    }
    return img.clone().resize({
        w: Math.max(1, round(width * scale)),
        h: Math.max(1, round(height * scale))
    });
}

function percentileFromHistogram(histogram, total, percentile) {
    const target = Math.max(1, Math.ceil(total * percentile));
    let seen = 0;
    for (let value = 0; value < histogram.length; value++) {
        seen += histogram[value];
        if (seen >= target) {
            return value;
        }
    }
    return histogram.length - 1;
}

/**
 * Build a bounded high-contrast edge map. Normalizing only the analysis clone makes dim or washed
 * out lettering detectable without modifying the pixels that are ultimately cropped for OCR/hash.
 */
function buildEdgeMap(img) {
    const analysis = resizeForEdgeAnalysis(img).greyscale().normalize();
    const { data, width, height } = analysis.bitmap;
    const strengths = new Uint8Array(width * height);
    const histogram = new Array(256).fill(0);
    let nonZero = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const index = y * width + x;
            const dataIndex = index * 4;
            const horizontal = Math.abs(data[dataIndex - 4] - data[dataIndex + 4]);
            const vertical = Math.abs(data[dataIndex - width * 4] - data[dataIndex + width * 4]);
            const strength = Math.min(255, Math.max(horizontal, vertical));
            strengths[index] = strength;
            if (strength > 0) {
                histogram[strength] += 1;
                nonZero += 1;
            }
        }
    }

    const adaptiveThreshold = nonZero > 0 ? percentileFromHistogram(histogram, nonZero, 0.72) : 255;
    const threshold = Math.max(config.minimumEdgeStrength, adaptiveThreshold);
    const edges = new Uint8Array(width * height);
    for (let index = 0; index < strengths.length; index++) {
        edges[index] = strengths[index] >= threshold ? 1 : 0;
    }
    return { edges, width, height, threshold };
}

function buildColorContrastMap(img) {
    const analysis = resizeForEdgeAnalysis(img);
    const { data, width, height } = analysis.bitmap;
    const redHistogram = new Array(256).fill(0);
    const greenHistogram = new Array(256).fill(0);
    const blueHistogram = new Array(256).fill(0);
    const insetX = Math.max(1, round(width * 0.05));
    const insetY = Math.max(1, round(height * 0.05));
    let sampled = 0;
    for (let y = insetY; y < height - insetY; y++) {
        for (let x = insetX; x < width - insetX; x++) {
            const dataIndex = (y * width + x) * 4;
            redHistogram[data[dataIndex]] += 1;
            greenHistogram[data[dataIndex + 1]] += 1;
            blueHistogram[data[dataIndex + 2]] += 1;
            sampled += 1;
        }
    }
    const medianRed = percentileFromHistogram(redHistogram, sampled, 0.5);
    const medianGreen = percentileFromHistogram(greenHistogram, sampled, 0.5);
    const medianBlue = percentileFromHistogram(blueHistogram, sampled, 0.5);
    const distances = new Uint8Array(width * height);
    const histogram = new Array(256).fill(0);
    for (let index = 0; index < distances.length; index++) {
        const dataIndex = index * 4;
        const distance = Math.min(
            255,
            Math.max(
                Math.abs(data[dataIndex] - medianRed),
                Math.abs(data[dataIndex + 1] - medianGreen),
                Math.abs(data[dataIndex + 2] - medianBlue)
            )
        );
        distances[index] = distance;
        histogram[distance] += 1;
    }
    const threshold = Math.max(24, percentileFromHistogram(histogram, distances.length, 0.78));
    const edges = new Uint8Array(distances.length);
    for (let index = 0; index < distances.length; index++) {
        edges[index] = distances[index] >= threshold ? 1 : 0;
    }
    return { edges, width, height, threshold };
}

function groupActiveIndexes(values, minimum, maxGap = 0) {
    const groups = [];
    let start = -1;
    let lastActive = -1;
    let score = 0;

    for (let index = 0; index < values.length; index++) {
        if (values[index] >= minimum) {
            if (start < 0) {
                start = index;
                score = 0;
            }
            lastActive = index;
            score += values[index];
            continue;
        }
        if (start >= 0 && index - lastActive > maxGap) {
            groups.push({ start, end: lastActive, score });
            start = -1;
            lastActive = -1;
            score = 0;
        }
    }
    if (start >= 0) {
        groups.push({ start, end: lastActive, score });
    }
    return groups;
}

function scaleBounds(bounds, analysisDimensions, sourceDimensions) {
    const scaleX = sourceDimensions.width / analysisDimensions.width;
    const scaleY = sourceDimensions.height / analysisDimensions.height;
    const left = clamp(Math.floor(bounds.left * scaleX), 0, sourceDimensions.width - 1);
    const top = clamp(Math.floor(bounds.top * scaleY), 0, sourceDimensions.height - 1);
    const right = clamp(
        Math.ceil((bounds.right + 1) * scaleX) - 1,
        left,
        sourceDimensions.width - 1
    );
    const bottom = clamp(
        Math.ceil((bounds.bottom + 1) * scaleY) - 1,
        top,
        sourceDimensions.height - 1
    );
    return { left, top, right, bottom };
}

/**
 * Locate the dominant text row(s) in an expected OCR window. Long frame rules are suppressed by
 * rejecting rows/columns whose edges cover nearly the whole window. Ambiguous windows return null
 * so the caller can preserve the established percentage crop.
 */
function detectTextContentBounds(img) {
    const edgeMap = buildEdgeMap(img);
    const { edges, width, height } = edgeMap;
    if (width < 3 || height < 3) {
        return null;
    }

    const rowScores = new Array(height).fill(0);
    for (let y = 1; y < height - 1; y++) {
        let score = 0;
        for (let x = 1; x < width - 1; x++) {
            score += edges[y * width + x];
        }
        // Frame/art-box dividers are wide, near-continuous edges rather than glyphs.
        rowScores[y] = score > width * 0.72 ? 0 : score;
    }

    const rowGroups = groupActiveIndexes(
        rowScores,
        Math.max(2, width * 0.018),
        Math.max(1, round(height * 0.035))
    ).filter(
        (group) =>
            group.end - group.start + 1 >= Math.max(2, round(height * 0.07)) &&
            group.end - group.start + 1 <= height * 0.82
    );
    if (rowGroups.length === 0) {
        return null;
    }

    const centerY = (height - 1) / 2;
    const selectedRows = rowGroups.reduce((best, candidate) => {
        const candidateCenter = (candidate.start + candidate.end) / 2;
        const centerWeight = 1 - (Math.abs(candidateCenter - centerY) / height) * 0.45;
        const candidateRank = candidate.score * centerWeight;
        return !best || candidateRank > best.rank ? { ...candidate, rank: candidateRank } : best;
    }, null);

    const bandHeight = selectedRows.end - selectedRows.start + 1;
    const columnScores = new Array(width).fill(0);
    for (let x = 1; x < width - 1; x++) {
        let score = 0;
        for (let y = selectedRows.start; y <= selectedRows.end; y++) {
            score += edges[y * width + x];
        }
        columnScores[x] = score > bandHeight * 0.88 ? 0 : score;
    }
    const columnGroups = groupActiveIndexes(
        columnScores,
        Math.max(1, bandHeight * 0.055),
        Math.max(1, round(width * 0.012))
    );
    if (columnGroups.length === 0) {
        return null;
    }

    const firstColumn = columnGroups[0].start;
    const lastColumn = columnGroups[columnGroups.length - 1].end;
    if (
        lastColumn - firstColumn + 1 < Math.max(3, width * 0.04) ||
        selectedRows.score < width * 0.08
    ) {
        return null;
    }

    return scaleBounds(
        {
            left: firstColumn,
            top: selectedRows.start,
            right: lastColumn,
            bottom: selectedRows.end
        },
        edgeMap,
        img.bitmap
    );
}

function dilateEdges(edges, width, height, radiusX, radiusY) {
    const dilated = new Uint8Array(edges.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!edges[y * width + x]) continue;
            for (let dy = -radiusY; dy <= radiusY; dy++) {
                const targetY = y + dy;
                if (targetY < 0 || targetY >= height) continue;
                for (let dx = -radiusX; dx <= radiusX; dx++) {
                    const targetX = x + dx;
                    if (targetX >= 0 && targetX < width) {
                        dilated[targetY * width + targetX] = 1;
                    }
                }
            }
        }
    }
    return dilated;
}

function findEdgeComponents(edgeMap) {
    const { width, height } = edgeMap;
    const edges = edgeMap.edges.slice();
    // A set symbol may overlap a frame rule in the raw search window. Remove only near-continuous
    // rows/columns before component grouping; the remaining outline still encloses the icon while
    // the long rule can no longer pull the component out to the window edges.
    for (let y = 0; y < height; y++) {
        let active = 0;
        for (let x = 0; x < width; x++) active += edges[y * width + x];
        if (active > width * 0.58) {
            for (let x = 0; x < width; x++) edges[y * width + x] = 0;
        }
    }
    for (let x = 0; x < width; x++) {
        let active = 0;
        for (let y = 0; y < height; y++) active += edges[y * width + x];
        if (active > height * 0.72) {
            for (let y = 0; y < height; y++) edges[y * width + x] = 0;
        }
    }
    const connected = dilateEdges(
        edges,
        width,
        height,
        Math.max(1, round(width * 0.008)),
        Math.max(1, round(height * 0.008))
    );
    const visited = new Uint8Array(connected.length);
    const components = [];

    for (let start = 0; start < connected.length; start++) {
        if (!connected[start] || visited[start]) continue;
        const queue = [start];
        visited[start] = 1;
        let cursor = 0;
        let left = start % width;
        let right = left;
        let top = Math.floor(start / width);
        let bottom = top;
        let area = 0;
        while (cursor < queue.length) {
            const index = queue[cursor++];
            const x = index % width;
            const y = Math.floor(index / width);
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            area += 1;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nextX = x + dx;
                    const nextY = y + dy;
                    if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
                    const next = nextY * width + nextX;
                    if (connected[next] && !visited[next]) {
                        visited[next] = 1;
                        queue.push(next);
                    }
                }
            }
        }
        components.push({ left, right, top, bottom, area });
    }
    return components;
}

/**
 * Locate a compact symbol-like edge component near the established set-symbol position. The
 * proximity preference lets older/newer frame offsets move naturally while rejecting type-line
 * rules and unrelated artwork elsewhere in the wider search window.
 */
function detectSymbolContentBounds(img, expectedCenter = { x: 0.5, y: 0.5 }) {
    const edgeMap = buildColorContrastMap(img);
    const { width, height } = edgeMap;
    const components = findEdgeComponents(edgeMap).filter((component) => {
        const componentWidth = component.right - component.left + 1;
        const componentHeight = component.bottom - component.top + 1;
        const aspectRatio = componentWidth / componentHeight;
        return (
            componentWidth >= Math.max(6, width * 0.025) &&
            componentHeight >= Math.max(6, height * 0.025) &&
            componentWidth <= width * 0.58 &&
            componentHeight <= height * 0.58 &&
            aspectRatio >= 0.6 &&
            aspectRatio <= 1.9
        );
    });
    if (components.length === 0) {
        return null;
    }

    const targetX = expectedCenter.x * width;
    const targetY = expectedCenter.y * height;
    const ranked = components
        .map((component) => {
            const componentWidth = component.right - component.left + 1;
            const componentHeight = component.bottom - component.top + 1;
            const centerX = (component.left + component.right) / 2;
            const centerY = (component.top + component.bottom) / 2;
            const distance = Math.hypot((centerX - targetX) / width, (centerY - targetY) / height);
            const proximity = Math.max(0, 1 - distance / 0.42);
            const shape = Math.max(0, 1 - Math.abs(Math.log(componentWidth / componentHeight)));
            const fill = Math.min(1, component.area / (componentWidth * componentHeight * 0.55));
            return { ...component, rank: proximity * 4 + shape + fill };
        })
        .sort((left, right) => right.rank - left.rank);
    const selected = ranked[0];
    if (selected.rank < 2.2) {
        return null;
    }
    return scaleBounds(selected, edgeMap, img.bitmap);
}

function expandBounds(bounds, sourceDimensions, options = {}) {
    const contentWidth = bounds.right - bounds.left + 1;
    const contentHeight = bounds.bottom - bounds.top + 1;
    const paddingX = Math.max(options.minimumPadding || 2, round(contentWidth * options.paddingX));
    const paddingY = Math.max(options.minimumPadding || 2, round(contentHeight * options.paddingY));
    let left = bounds.left - paddingX;
    let right = bounds.right + paddingX;
    let top = bounds.top - paddingY;
    let bottom = bounds.bottom + paddingY;

    if (options.square) {
        const size = Math.max(right - left + 1, bottom - top + 1);
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;
        left = Math.floor(centerX - size / 2);
        right = left + size - 1;
        top = Math.floor(centerY - size / 2);
        bottom = top + size - 1;
    }

    // Shift a padded crop back inside the source instead of clipping one side's buffer whenever
    // there is room on the opposite side.
    if (left < 0) {
        right -= left;
        left = 0;
    }
    if (top < 0) {
        bottom -= top;
        top = 0;
    }
    if (right >= sourceDimensions.width) {
        left -= right - sourceDimensions.width + 1;
        right = sourceDimensions.width - 1;
    }
    if (bottom >= sourceDimensions.height) {
        top -= bottom - sourceDimensions.height + 1;
        bottom = sourceDimensions.height - 1;
    }

    left = clamp(left, 0, sourceDimensions.width - 1);
    right = clamp(right, left, sourceDimensions.width - 1);
    top = clamp(top, 0, sourceDimensions.height - 1);
    bottom = clamp(bottom, top, sourceDimensions.height - 1);
    return { left, top, right, bottom };
}

function cropDetectedBounds(img, searchRegion, localBounds, options) {
    const globalBounds = {
        left: searchRegion.left + localBounds.left,
        top: searchRegion.top + localBounds.top,
        right: searchRegion.left + localBounds.right,
        bottom: searchRegion.top + localBounds.bottom
    };
    const expanded = expandBounds(globalBounds, img.bitmap, options);
    if (options.constrainToSearch) {
        expanded.left = Math.max(expanded.left, searchRegion.left);
        expanded.top = Math.max(expanded.top, searchRegion.top);
        expanded.right = Math.min(expanded.right, searchRegion.left + searchRegion.width - 1);
        expanded.bottom = Math.min(expanded.bottom, searchRegion.top + searchRegion.height - 1);
    }
    const region = {
        left: expanded.left,
        top: expanded.top,
        width: expanded.right - expanded.left + 1,
        height: expanded.bottom - expanded.top + 1
    };
    return {
        image: img
            .clone()
            .crop({ x: region.left, y: region.top, w: region.width, h: region.height }),
        region,
        searchRegion,
        contentDetected: true
    };
}

/** Crop an OCR search template down to its dominant text, retaining a visible buffer. */
function cropTextRegion(img, template) {
    const search = cropRegion(img, template);
    // A dominant-row crop is appropriate only when Tesseract expects one line. Block and sparse
    // templates intentionally cover multiple possible rows; narrowing those would hide text that
    // the fallback exists to recover.
    if (template.psm && !["line", "raw-line"].includes(template.psm)) {
        return { ...search, searchRegion: search.region, contentDetected: false };
    }
    const bounds = detectTextContentBounds(search.image);
    if (!bounds) {
        return { ...search, searchRegion: search.region, contentDetected: false };
    }
    // A component touching the analysis boundary may continue outside this template. Refining it
    // would make an already-tight crop worse, so keep the broader search window for another OCR
    // variant to evaluate.
    if (
        bounds.left <= 1 ||
        bounds.top <= 1 ||
        bounds.right >= search.region.width - 2 ||
        bounds.bottom >= search.region.height - 2
    ) {
        return { ...search, searchRegion: search.region, contentDetected: false };
    }
    return cropDetectedBounds(img, search.region, bounds, {
        paddingX: 0.04,
        paddingY: 0.2,
        minimumPadding: 3,
        constrainToSearch: true
    });
}

function computeGreyscaleStdDev(img) {
    const grey = img.clone().greyscale();
    const { data } = grey.bitmap;
    let sum = 0;
    let count = 0;
    for (let idx = 0; idx < data.length; idx += 4) {
        sum += data[idx];
        count += 1;
    }
    const mean = count > 0 ? sum / count : 0;
    let squaredDiffSum = 0;
    for (let idx = 0; idx < data.length; idx += 4) {
        squaredDiffSum += (data[idx] - mean) ** 2;
    }
    return count > 0 ? Math.sqrt(squaredDiffSum / count) : 0;
}

/**
 * Flag crops that likely landed on a blank/flat area (solid border, background) rather than real
 * content, so callers can fall back instead of hashing noise.
 */
function assessConfidence(croppedImg) {
    const stdDev = computeGreyscaleStdDev(croppedImg);
    if (stdDev < config.lowConfidenceStdDevThreshold) {
        return {
            lowConfidence: true,
            reason: `flat region (stdDev ${round(stdDev, 2)} < ${config.lowConfidenceStdDevThreshold})`
        };
    }
    return { lowConfidence: false };
}

/**
 * Crop the set-symbol region from an already-loaded jimp image. Used by callers that already
 * have an in-memory image (e.g. remote Scryfall image comparison).
 */
function cropSetSymbolFromImage(img) {
    const search = cropRegion(img, regions.setSymbolSearch);
    const expectedCenter = {
        x:
            (regions.setSymbol.leftPercent +
                regions.setSymbol.widthPercent / 2 -
                regions.setSymbolSearch.leftPercent) /
            regions.setSymbolSearch.widthPercent,
        y:
            (regions.setSymbol.topPercent +
                regions.setSymbol.heightPercent / 2 -
                regions.setSymbolSearch.topPercent) /
            regions.setSymbolSearch.heightPercent
    };
    const bounds = detectSymbolContentBounds(search.image, expectedCenter);
    if (!bounds) {
        const legacy = cropRegion(img, regions.setSymbol);
        return {
            ...legacy,
            searchRegion: search.region,
            contentDetected: false,
            lowConfidence: true,
            reason: "set symbol edges were not detected"
        };
    }
    const result = cropDetectedBounds(img, search.region, bounds, {
        paddingX: 0.2,
        paddingY: 0.2,
        minimumPadding: 3,
        square: true
    });
    return { ...result, ...assessConfidence(result.image) };
}

/**
 * Crop the set-symbol region from a file on disk and write it to a temp file, for callers that
 * need a file path. Throws on undersized source images and
 * on low-confidence crops -- both cases should fall back to full-card hashing at the call site.
 */
async function writeSetSymbolSnippet(imgPath, directory) {
    const img = await readImage(imgPath);
    const dimensions = img.bitmap;
    assertSourceSizeOk(dimensions);
    const result = cropSetSymbolFromImage(img);
    if (result.lowConfidence) {
        throw new Error(`Set symbol crop is low confidence: ${result.reason}`);
    }
    const ext = path.extname(imgPath) || ".jpg";
    const filePath = path.join(directory, `${randomUUID()}${ext}`);
    await result.image.write(filePath);
    return filePath;
}

export {
    setSymbolHashMode,
    regions,
    getRegionTemplates,
    cropRegion,
    detectTextContentBounds,
    detectSymbolContentBounds,
    cropTextRegion,
    computeGreyscaleStdDev,
    assessConfidence,
    assertSourceSizeOk,
    assertOcrSourceSizeOk,
    cropSetSymbolFromImage,
    writeSetSymbolSnippet
};

export default {
    setSymbolHashMode,
    regions,
    getRegionTemplates,
    cropRegion,
    detectTextContentBounds,
    detectSymbolContentBounds,
    cropTextRegion,
    computeGreyscaleStdDev,
    assessConfidence,
    assertSourceSizeOk,
    assertOcrSourceSizeOk,
    cropSetSymbolFromImage,
    writeSetSymbolSnippet
};
