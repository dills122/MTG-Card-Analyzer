import { promisify } from "node:util";

async function extractText({
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
    const results = await promisify(extractor.extract.bind(extractor))();
    return { results, imagePath: extractor.imagePath };
}

async function matchName({
    extractionResults,
    supplementalText,
    MatchName,
    matchDependencies,
    logger
}) {
    const matcher = MatchName.create({
        cleanText: extractionResults.cleanText,
        ...(extractionResults.dirtyText ? { dirtyText: extractionResults.dirtyText } : {}),
        candidateTexts: extractionResults.textCandidates || [],
        ...(supplementalText ? { supplementalText } : {}),
        ...(matchDependencies ? { dependencies: matchDependencies } : {}),
        ...(logger ? { logger } : {})
    });
    const matches = await matcher.match();
    return { matches, matchedText: matcher.matchedText };
}

async function resolveCardName(options) {
    const title = options.titleExtractionResults
        ? {
              results: options.titleExtractionResults,
              imagePath: options.titleExtractionImagePath
          }
        : await extractText({ ...options, type: "name" });
    const titleStages = [title];
    let combinedTitleResults = combineExtractionResults(titleStages);
    let resolution = await matchName({
        extractionResults: combinedTitleResults,
        MatchName: options.MatchName,
        matchDependencies: options.matchDependencies,
        logger: options.logger
    });
    let selectedTitle = title;
    let supplemental;

    for (const type of ["soft-name", "rotated-name"]) {
        if (resolution.matches.length > 0) break;
        const fallback = await extractText({ ...options, type });
        titleStages.push(fallback);
        combinedTitleResults = combineExtractionResults(titleStages);
        resolution = await matchName({
            extractionResults: combinedTitleResults,
            MatchName: options.MatchName,
            matchDependencies: options.matchDependencies,
            logger: options.logger
        });
    }

    if (resolution.matches.length === 0) {
        supplemental = await extractText({ ...options, type: "rules-name" });
        resolution = await matchName({
            extractionResults: combinedTitleResults,
            supplementalText: supplemental.results.dirtyText,
            MatchName: options.MatchName,
            matchDependencies: options.matchDependencies,
            logger: options.logger
        });
    }

    const promoted = promoteMatchedExtraction(titleStages, resolution.matchedText);
    if (promoted) {
        selectedTitle = promoted;
    }

    return {
        extractionResults: selectedTitle.results,
        extractionImagePath: selectedTitle.imagePath,
        matches: resolution.matches,
        supplementalExtractionResults: supplemental?.results
    };
}

function combineExtractionResults(stages) {
    const first = stages[0].results;
    return {
        ...first,
        textCandidates: uniqueText(
            stages.flatMap(({ results }) => [
                results.cleanText,
                ...(results.textCandidates || []),
                ...(results.candidates || []).flatMap((candidate) => [
                    candidate.cleanText,
                    ...(candidate.textCandidates || [])
                ])
            ])
        ).slice(0, 48)
    };
}

function promoteMatchedExtraction(stages, matchedText) {
    const normalizedMatch = normalizeText(matchedText);
    if (!normalizedMatch) return null;

    for (const stage of stages) {
        for (const candidate of stage.results.candidates || []) {
            const candidateTexts = [candidate.cleanText, ...(candidate.textCandidates || [])];
            const matchedCandidateText = candidateTexts.find(
                (text) => normalizeText(text) === normalizedMatch
            );
            if (matchedCandidateText) {
                return {
                    ...stage,
                    results: {
                        ...stage.results,
                        cleanText: matchedCandidateText,
                        dirtyText: candidate.dirtyText,
                        confidence: candidate.confidence,
                        bestVariant: candidate
                    }
                };
            }
        }
    }
    return null;
}

function uniqueText(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeText(value) {
    return String(value || "")
        .toUpperCase()
        .trim();
}

export { resolveCardName };

export default { resolveCardName };
