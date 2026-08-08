function extractText({
    filePath,
    directory,
    type,
    ImageProcessor,
    logger,
    ocrOptions,
    persistArtifacts
}) {
    const extractor = ImageProcessor.create({
        path: filePath,
        type,
        directory,
        ...(logger ? { logger } : {}),
        ...(ocrOptions ? { ocrOptions } : {}),
        ...(typeof persistArtifacts === "boolean" ? { persistArtifacts } : {})
    });
    return new Promise((resolve, reject) => {
        extractor.extract((err, results) => {
            if (err) {
                reject(err);
                return;
            }
            resolve({ results, imagePath: extractor.imagePath });
        });
    });
}

function matchName({ extractionResults, supplementalText, MatchName, matchDependencies, logger }) {
    return MatchName.create({
        cleanText: extractionResults.cleanText,
        dirtyText: extractionResults.dirtyText,
        ...(supplementalText ? { supplementalText } : {}),
        ...(matchDependencies ? { dependencies: matchDependencies } : {}),
        ...(logger ? { logger } : {})
    }).Match();
}

async function resolveCardName(options) {
    const title = options.titleExtractionResults
        ? {
              results: options.titleExtractionResults,
              imagePath: options.titleExtractionImagePath
          }
        : await extractText({ ...options, type: "name" });
    let matches = await matchName({
        extractionResults: title.results,
        MatchName: options.MatchName,
        matchDependencies: options.matchDependencies,
        logger: options.logger
    });
    let supplemental;

    if (matches.length === 0) {
        supplemental = await extractText({ ...options, type: "rules-name" });
        matches = await matchName({
            extractionResults: title.results,
            supplementalText: supplemental.results.dirtyText,
            MatchName: options.MatchName,
            matchDependencies: options.matchDependencies,
            logger: options.logger
        });
    }

    return {
        extractionResults: title.results,
        extractionImagePath: title.imagePath,
        matches,
        supplementalExtractionResults: supplemental?.results
    };
}

export { resolveCardName };

export default { resolveCardName };
