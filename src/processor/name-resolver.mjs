import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

function elapsedSince(startedAt) {
    return Math.round((performance.now() - startedAt) * 100) / 100;
}

function roundMs(value) {
    return Math.round(value * 100) / 100;
}

async function measure(operation) {
    const startedAt = performance.now();
    const value = await operation();
    return { value, elapsedMs: elapsedSince(startedAt) };
}

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
        candidateTexts: extractionResults.textCandidates || [],
        ...(supplementalText ? { supplementalText } : {}),
        ...(matchDependencies ? { dependencies: matchDependencies } : {}),
        ...(logger ? { logger } : {})
    });
    const matches = await matcher.match();
    return { matches, matchedText: matcher.matchedText };
}

async function resolveCardName(options) {
    const timings = {
        titleOcrMs: 0,
        initialMatchMs: 0,
        fallbackTitleOcrMs: 0,
        fallbackMatchMs: 0,
        supplementalOcrMs: 0,
        supplementalMatchMs: 0,
        totalMatchMs: 0,
        totalFallbackOcrMs: 0
    };
    let title;
    if (options.titleExtractionResults) {
        title = {
            results: options.titleExtractionResults,
            imagePath: options.titleExtractionImagePath
        };
    } else {
        const measuredTitle = await measure(() => extractText({ ...options, type: "name" }));
        title = measuredTitle.value;
        timings.titleOcrMs = measuredTitle.elapsedMs;
    }
    const titleStages = [title];
    let combinedTitleResults = combineExtractionResults(titleStages);
    const measuredInitialMatch = await measure(() =>
        matchName({
            extractionResults: combinedTitleResults,
            MatchName: options.MatchName,
            matchDependencies: options.matchDependencies,
            logger: options.logger
        })
    );
    let resolution = measuredInitialMatch.value;
    timings.initialMatchMs = measuredInitialMatch.elapsedMs;
    let selectedTitle = title;
    let supplemental;

    for (const type of ["soft-name", "rotated-name"]) {
        if (resolution.matches.length > 0) break;
        const measuredFallback = await measure(() => extractText({ ...options, type }));
        const fallback = measuredFallback.value;
        timings.fallbackTitleOcrMs = roundMs(
            timings.fallbackTitleOcrMs + measuredFallback.elapsedMs
        );
        titleStages.push(fallback);
        combinedTitleResults = combineExtractionResults(titleStages);
        const measuredFallbackMatch = await measure(() =>
            matchName({
                extractionResults: combinedTitleResults,
                MatchName: options.MatchName,
                matchDependencies: options.matchDependencies,
                logger: options.logger
            })
        );
        resolution = measuredFallbackMatch.value;
        timings.fallbackMatchMs = roundMs(
            timings.fallbackMatchMs + measuredFallbackMatch.elapsedMs
        );
    }

    if (resolution.matches.length === 0) {
        const measuredSupplemental = await measure(() =>
            extractText({ ...options, type: "rules-name" })
        );
        supplemental = measuredSupplemental.value;
        timings.supplementalOcrMs = measuredSupplemental.elapsedMs;
        const measuredSupplementalMatch = await measure(() =>
            matchName({
                extractionResults: combinedTitleResults,
                supplementalText: supplemental.results.dirtyText,
                MatchName: options.MatchName,
                matchDependencies: options.matchDependencies,
                logger: options.logger
            })
        );
        resolution = measuredSupplementalMatch.value;
        timings.supplementalMatchMs = measuredSupplementalMatch.elapsedMs;
    }

    timings.totalMatchMs = roundMs(
        timings.initialMatchMs + timings.fallbackMatchMs + timings.supplementalMatchMs
    );
    timings.totalFallbackOcrMs = roundMs(timings.fallbackTitleOcrMs + timings.supplementalOcrMs);

    const promoted = promoteMatchedExtraction(titleStages, resolution.matchedText);
    if (promoted) {
        selectedTitle = promoted;
    }

    return {
        extractionResults: selectedTitle.results,
        extractionImagePath: selectedTitle.imagePath,
        matches: resolution.matches,
        supplementalExtractionResults: supplemental?.results,
        timings
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
