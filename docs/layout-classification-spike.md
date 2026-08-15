# Card layout classification spike

Date: 2026-08-15

## Recommendation

Do not make `vintage`, `full-art/pop-culture`, and `standard` a forced three-way semantic
classification. Add a precision-first **visual processing profile** with an explicit `unknown`
outcome, plus separately scored layout capabilities:

- `classic-frame`: a visually classic/retro portrait frame that merits classic title extraction;
- `conventional-title`: a conventional portrait title bar that can use the established rules;
- `nonstandard`: pixels contradict conventional title geometry, so use a bounded hypothesis set;
- `unknown`: evidence is weak, contradictory, out of distribution, or the card boundary is unreliable.

`classic-frame` is intentionally visual. It includes a modern retro-frame treatment when the same
crop rules are useful; release date is catalog context, not an input to the first pixel-only pass.
`full-art` is a treatment signal, while “pop-culture” describes subject matter or product identity
and has no stable geometry. They should not be one learned class. `nonstandard` is only a safe routing
outcome; its actual crop choices should come from capabilities such as `title-top`, `title-rotated`,
`collector-block`, `conventional-set-symbol`, `textless`, and `artwork-dominant`.

The first implementation should be an offline label-overlay contract and shadow benchmark. Do not
route production crops until held-out, class-specific precision supports it.

## Evidence from this repository

### Current pipeline and integration constraints

- `src/processor/processor.mjs` requests `name` OCR before any card identity or print metadata exists.
- `src/image-processing/smart-crop.mjs` currently exposes fixed percentage templates: four title
  regions, soft/inverted variants, two rotated title bands, a rules-text fallback, and one fixed
  set-symbol region.
- `src/image-processing/ocr-preprocessing.mjs` turns each template into a hard or soft raster; it has
  no layout profile input.
- `src/image-analysis/extract-text.mjs` selects a best OCR result from confidence plus title-shaped
  heuristics. This is OCR-result selection, not independent layout confidence.
- `src/processor/name-resolver.mjs` progresses through hard title, soft/inverted title, rotated title,
  then rules text. It already provides the right bounded-fallback pattern.
- The regression runner uses the production OCR/name path offline, but does not yet report layout
  labels, classifier decisions, abstention, or routing errors.

Therefore the first pass must use pixels available immediately after input validation. Successful
OCR, fuzzy name matching, Scryfall search results, release year, and treatment metadata are not valid
first-pass inputs: depending on them would make routing depend on the crop/OCR behavior routing is
supposed to choose.

### Corpus shape

The regression manifest has 227 cases and 220 catalog entries. Of the 158 enabled cases, 150 are
clean scans; the seven other quality cohorts contain only one case each except low resolution, which
has two. The enabled catalog supplies these useful but unreviewed proxies:

- 7 explicitly tracked vintage cases, all non-blocking;
- 24 nonstandard-style catalog entries: 9 full-art, 7 extended-art, 5 showcase, 2 borderless, and 1
  textless;
- 98 entries labeled `style: normal`;
- 29 enabled entries without an explicit style label.

These are coverage metadata, not visual ground truth. The corpus is strongly biased toward clean
Scryfall renders and is too small in the vintage and nonstandard cohorts to calibrate high confidence.

### User crop-review evidence

The authoritative user-generated export for dataset `1c9edd67818b9575` was inspected read-only and
was not copied, relabeled, or modified. It retains all 70 earlier crop decisions and all 10 non-empty
notes without a status change. The earlier title findings therefore still stand:

- `name:top-band` was rejected in all 4 reviewed examples;
- `name:name-core` was approved in 9/10 and `name:name-wide` in 4/5; both failures were `vtg-1`;
- `soft-name:name-wide-soft` was approved in 6/6;
- notes/tags cite blur, artifacting, excess height, cut-off text, incomplete symbols, and wrong
  regions.

The deep set-symbol pass reviewed 151/158 enabled fixtures: 105 approved (69.5%) and 46 needing
attention (30.5%). The seven missing reviews are `pacifism-poor-lighting`, `pacifism-blur`,
`pacifism-rotation`, `pacifism-cropping`, `pacifism-low-resolution`, `land-2-pending`, and
`vtg-3-pending`. Among failures, `wrong-region` appears 25 times and `set-icon-incomplete` 22 times;
the tags overlap on some cases. The Mending of Dominaria is the one untagged failure. Fifteen approved
set crops still carry issue tags, mostly extra height/width or off-center, so approval and
observations are orthogonal labels.

Structural layout correlates much more strongly with failure than broad treatment style:

| Cohort                     | Approved | Reviewed | Approval rate |
| -------------------------- | -------: | -------: | ------------: |
| `layout: normal`           |       83 |      111 |         74.8% |
| `layout: split`            |        0 |        4 |          0.0% |
| `layout: saga`             |        0 |        3 |          0.0% |
| `layout: flip`             |        0 |        1 |          0.0% |
| `layout: planar`           |        0 |        1 |          0.0% |
| `layout: meld`             |        1 |        2 |         50.0% |
| `style: normal`            |       67 |       98 |         68.4% |
| `style: full-art`          |        8 |        9 |         88.9% |
| `style: extended-art`      |        5 |        7 |         71.4% |
| `style: showcase`          |        3 |        5 |         60.0% |
| reviewed vintage set crops |        5 |        6 |         83.3% |

The only reviewed vintage failure is `vtg-2` (`set-icon-incomplete`); `vtg-3` is unreviewed, and two
approved vintage crops are tagged oversized. This evidence rejects broad “vintage” or
“full-art/pop-culture” routing for set symbols. It supports detecting structural layout and explicit
capabilities such as symbol presence, expected anchor, per-face orientation, and crop completeness.
The review is still evaluation data rather than training truth, and the nonstandard-layout cohorts
remain small.

### Cheap-signal exploratory benchmark

`scripts/benchmark-layout-signals.mjs` tests an intentionally small OCR-free baseline. It downsamples
each image to 64 by 88 pixels, summarizes luminance, saturation, and horizontal/vertical edge energy
on an 8 by 11 grid, and classifies against leave-one-source-image-out class centroids. Labels are
explicitly weak proxies: `vtg-*`, catalog nonstandard styles, and `style: normal`.

On 129 unique source images (7 vintage, 24 nonstandard, 98 standard):

| Margin threshold | Coverage | Overall precision | Vintage precision | Nonstandard precision | Standard precision |
| ---------------- | -------: | ----------------: | ----------------: | --------------------: | -----------------: |
| 0.00             |   100.0% |             75.2% |             31.3% |                 56.0% |              88.6% |
| 0.20             |    51.2% |             93.9% |             50.0% |                 81.8% |              98.1% |
| 0.25             |    31.8% |             95.1% |             50.0% |                 85.7% |             100.0% |
| 0.30             |    14.0% |            100.0% |    1/1 prediction |       2/2 predictions |  15/15 predictions |

The 0.30 result is not a calibrated threshold: it has only three accepted vintage/nonstandard
predictions and was evaluated on proxy labels from the same corpus used to form the prototypes. The
useful result is the failure at ordinary coverage. Coarse geometry may contribute evidence and can
support abstention, but it is unsafe as the sole router for classic or nonstandard frames.

## Signals available before identification

The classifier should consume one bounded, orientation-normalized analysis raster and report raw
evidence, not card identity.

| Signal                                     | Early enough?            | Use                                                                                                             | Main limitations                                                                                     |
| ------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Input aspect ratio and boundary confidence | Yes                      | Reject/abstain on partial cards, landscape orientation, or unreliable normalization                             | Describes capture quality more than frame family                                                     |
| Border/frame geometry                      | Yes                      | Detect border rings, title/rules boxes, art-window edges, full-bleed transitions, and expected horizontal rules | Glare, sleeves, crops, borderless art, and modern retro frames overlap                               |
| Regional edge/ink distributions            | Yes                      | Locate text-like rows and compare energy around expected title, type, rules, and collector bands                | Decorative art and textured frames create false rows                                                 |
| Color/luminance distributions              | Yes                      | Supporting evidence for black borders, pale text boxes, and full-bleed art                                      | Card color and illumination dominate; never sufficient alone                                         |
| Rigid frame/template matching              | Yes, after normalization | Strong evidence for a small reviewed frame family                                                               | A template slides at a fixed scale; variants, skew, and new frames require many templates            |
| ORB/AKAZE plus homography                  | Yes                      | Card rectification or matching a reviewed frame/reference despite perspective                                   | Dependency/package cost; poor texture and repeated frame details; not an open-set classifier         |
| Small OCR/layout probes                    | Yes, if identity-free    | Detect text presence, line count, bounding boxes, or a modern collector-code shape                              | Adds the expensive dependency being routed; confidence on noise is not layout confidence             |
| Lightweight image classifier               | Yes                      | Learn combinations of geometry that hand features miss                                                          | Needs reviewed open-set data, model provenance/hash, deterministic preprocessing, and OOD abstention |
| Candidate metadata                         | No for pass one          | One bounded second pass when independent name evidence produces candidates whose capabilities agree             | Circular if used to justify the OCR result that created the candidates                               |

OpenCV's template matching compares a fixed rectangular patch by sliding it over an image, while its
ORB/AKAZE examples use bounded keypoints, matching, RANSAC, and homography for planar tracking. Those
methods are better candidates for normalization and reviewed-frame evidence than for naming every new
treatment. Tesseract's guidance also emphasizes scale, skew, borders, preprocessing, and the correct
page-segmentation mode before retraining; small layout probes should retain reasonable borders and
must not be treated as class truth merely because OCR returns a high confidence.

## Proposed contract

Keep raster feature extraction in `src/image-processing/` and the pure abstention decision in
`src/image-analysis/`. A versioned result should look like:

```js
{
    version: 1,
    status: "classified" | "unknown",
    profile: "classic-frame" | "conventional-title" | "nonstandard" | null,
    confidence: 0.997,
    runnerUp: { profile: "nonstandard", confidence: 0.21 },
    margin: 0.787,
    capabilities: {
        titleTop: { state: "present", confidence: 0.99 },
        titleRotated: { state: "unknown", confidence: 0.4 },
        collectorBlock: { state: "absent", confidence: 0.91 },
        conventionalSetSymbol: { state: "unknown", confidence: 0.5 },
        textless: { state: "unknown", confidence: 0.5 },
        artworkDominant: { state: "present", confidence: 0.94 }
    },
    boundary: { normalized: true, confidence: 0.995, orientation: 0 },
    evidence: [
        { signal: "title-row", score: 0.98, region: [0.05, 0.03, 0.9, 0.12] },
        { signal: "full-bleed-edge", score: 0.93 }
    ],
    reasonCodes: ["CLASS_THRESHOLD_MET", "MARGIN_THRESHOLD_MET"],
    classifier: { id: "layout-features-v1", artifactSha256: null }
}
```

`confidence` must mean held-out, class-calibrated confidence for the exact classifier version; until
calibration exists, expose raw `score`/`margin` and return `unknown`. Do not turn a hand-written
weighted score into a probability.

Return `unknown` when any of these holds:

- card boundary/orientation confidence is below its gate;
- top class confidence or runner-up margin is below its class-specific gate;
- required independent signals disagree;
- the input is outside the calibration envelope;
- capabilities imply several incompatible crop profiles;
- the classifier artifact or preprocessing version does not match the benchmarked version.

A classified result should require two independent signal families, such as frame geometry plus text
row placement. Metadata is a separate source and must be identified in evidence rather than folded
silently into a pixel score.

## Safe routing and fallback

1. Validate and normalize the input once. If boundary confidence is low, preserve today's bounded
   crop sequence and mark layout `unknown`.
2. Run the cheap pixel-only classifier on a capped analysis raster.
3. Route only a high-confidence profile. `nonstandard` selects at most two capability-compatible
   hypotheses; it does not select one universal “full-art” crop.
4. Stop on a strong name result as today.
5. If name evidence exists but remains ambiguous, allow one metadata-assisted retry only when the
   bounded candidates agree on a visible capability. Never recurse.
6. If classification is unknown or a routed profile fails, fall back to the established hard, soft,
   rotated, and rules-text sequence with global limits on profiles, crops, OCR calls, and elapsed time.

Initially, classification should only reorder or add bounded hypotheses; it must not remove the
existing safe fallback. A wrong high-confidence route is more harmful than an abstention.

## Labeled evaluation set

Add a separate `test/layout-classification/fixtures/manifest.json` that references regression case
IDs. Do not change `test/regression/fixtures/manifest.json`, existing `enabled`/`blocking` values, OCR
thresholds, expected identities, or binary images to make classification pass.

Each reviewed record should include:

```json
{
    "id": "vtg-1-layout-review",
    "regressionCaseId": "vtg-1-pending",
    "label": {
        "profile": "classic-frame",
        "ambiguous": false,
        "capabilities": {
            "titleTop": "present",
            "collectorBlock": "absent",
            "conventionalSetSymbol": "present",
            "setSymbolAnchor": "type-line"
        }
    },
    "labelProvenance": {
        "reviewedBy": "human",
        "reviewedAt": "2026-08-15T00:00:00.000Z",
        "catalogContextShown": false
    },
    "cropReview": {
        "datasetId": "1c9edd67818b9575",
        "status": "needs-attention",
        "legacyNote": "preserved verbatim",
        "tags": ["has-artifacting", "text-blurry", "cutting-text-off"]
    },
    "splitGroup": "sha256-of-original-source-or-capture-session",
    "enabled": false
}
```

Import review data additively and atomically:

- preserve every existing `status`, `note`, `tags`, and timestamp verbatim;
- copy free text to `legacyNote`; derive structured observations into a new field without replacing
  the original;
- reject an import whose dataset ID or crop checksum does not match;
- never reinterpret `approved` as a card-profile label;
- preserve approval status and issue observations as separate fields, including observations on
  approved crops;
- write new records as disabled until a human reviews the visual profile and capabilities;
- keep proxy labels explicitly marked `proxy` and exclude them from final calibration.

Review labels without release dates first so `classic-frame` remains visual. Store release year,
Scryfall style, frame effects, and product identity as separate audit context. Include hard negatives:
modern retro frames, standard-layout Universes Beyond cards, conventional full-art title bars,
borderless/showcase variants, textless cards, split/saga/planar/double-faced layouts, tight crops,
sleeves, glare, rotation, and partial card boundaries.

Split by original source/capture session and printing, not by derived case. Synthetic transforms and
near-duplicate art must stay in one split. Suggested stages are:

- feasibility: at least 40 reviewed examples per profile plus 40 deliberate ambiguous/unknown cases;
- held-out promotion: enough accepted predictions per routed profile to support the precision claim;
  with zero observed errors, roughly 300 accepted predictions are needed before a simple “rule of
  three” supports an error rate below about 1% at 95% confidence.

## Offline benchmark and acceptance criteria

Create a layout benchmark beside, not inside, the existing OCR gate. It must run without network,
database, OCR cache, or mutable model downloads and produce Markdown plus JSON. Record confusion
matrices both before and after abstention, per-profile precision/recall/coverage, unknown rate, false
route rate, boundary failures, capability accuracy, score calibration, runtime, peak analysis pixels,
and classifier/model hashes. For set-symbol routing, report acceptance and failure tags separately by
structural layout, orientation, symbol-presence capability, treatment style, vintage visual profile,
and input quality. Include the seven currently unreviewed crops as missing labels, not implicit passes
or failures.

Promotion gates:

- **Precision:** observed precision at least 99% for every profile that changes processing, with a
  one-sided 95% lower confidence bound at least 95%; zero wrong classic/nonstandard routes in the
  held-out safety cohort. Stay shadow-only if sample size cannot support the claim.
- **Abstention:** ambiguous and out-of-distribution fixtures route to `unknown` at least 95% of the
  time; coverage has no initial minimum. Report coverage rather than weakening the confidence gate.
- **Regression safety:** all existing 151 blocking OCR fixtures remain passing; do not convert a
  failure to non-blocking or refresh an expectation.
- **Crop evidence:** no newly routed crop regresses an existing approved crop for the same checksum;
  existing needs-attention observations and issue tags on approved crops remain visible. Report wrong
  region, incomplete symbol, and geometry-quality failures independently.
- **Determinism:** two runs over identical bytes produce byte-equivalent decisions and summaries
  after timestamps are excluded.
- **Bounds:** analysis raster at most 256 by 352, at most two nonstandard hypotheses, no first-pass
  network/database work, and no durable image artifacts. Establish p95 time and memory baselines in
  CI before setting a cross-machine hard latency gate.
- **Packaging:** any model is committed or release-bundled with source, license, training revision,
  preprocessing version, SHA-256, size cap, and CPU-only offline inference verification.

## Integration and staged rollout

The best logical production seam is immediately before `Processor.extractNameAsync()` creates its
first `ImageProcessor`. Add an internal path that shares one validated image between bounded feature
extraction and crop generation, decide under `src/image-analysis/`, and pass only the resulting
profile/capabilities into preprocessing. This avoids a second decode while keeping the CLI boundary
thin. A later metadata-assisted retry belongs in `name-resolver.mjs` after independent name candidates
exist and is limited to one retry.

Roll out in stages:

1. Land the label overlay, review importer, deterministic benchmark, and report schema.
2. Add pixel-only classification in regression/crop-review shadow mode. Production behavior is
   unchanged.
3. Emit sanitized debug evidence and collect false-route/unknown results; freeze thresholds and the
   classifier artifact before held-out evaluation.
4. Enable only the profile(s) that pass class-specific gates, behind an explicit experimental local
   configuration defaulting off. Keep the established fallback.
5. After full OCR regression and package evidence, default proven profiles on. Add the bounded
   metadata-assisted second pass separately so its effect is measurable.

Debug/ops output should include status, profile, raw score or calibrated confidence, runner-up margin,
boundary confidence, capability states, reason codes, classifier version/hash, profiles attempted,
fallback reason, OCR crop count, and stage timings. Do not log raw feature vectors, image bytes,
remote URLs, or newly derived user data by default. Regression reports may include reviewed case IDs
and normalized regions.

## Alternatives considered

- **Release-date routing:** rejected for the first pass. It requires identification and confuses
  modern retro treatments with historical cards.
- **One `full-art/pop-culture` class:** rejected. Full-art is a visual treatment; pop-culture is not a
  geometry. Use capabilities and candidate metadata instead.
- **Coarse edges alone:** useful as evidence but rejected as the router by the exploratory result.
- **Large frame-template library:** defer. It is explainable but brittle and costly to maintain; use a
  few reviewed templates only after boundary normalization.
- **OCR-first classification:** defer to a small supporting probe. It adds circularity and latency if
  recognized identity or OCR confidence drives the initial route.
- **End-to-end neural classifier now:** defer. ONNX Runtime supports local CPU inference from Node on
  the target desktop platforms, but the repository lacks reviewed open-set data and held-out capture
  diversity. A small quantized model is viable only after the benchmark exists.
- **Always run every crop strategy:** safe for recall but rejected as the steady state because OCR
  calls and memory grow quickly. Retain it only as a bounded failure fallback.

## Recommended first implementation slice

Implement only the data and measurement contract:

1. add `test/layout-classification/fixtures/manifest.json` with disabled, human-reviewed overlays;
2. add a read-only importer for crop-review JSON that preserves status, notes, tags, timestamps, and
   dataset/checksum identity;
3. extend the crop-review workbench to label visual profile, ambiguity, and capabilities separately
   from crop quality, including set-symbol presence/anchor and structural orientation;
4. add an offline benchmark with a deliberately simple geometry baseline and `unknown` thresholds;
5. report per-class precision/coverage and exact false routes; do not connect the result to
   `prepareOcrVariants` yet.

This slice produces the evidence needed to choose between engineered geometry and a lightweight
model without risking production OCR. Its main risks are reviewer inconsistency, proxy-label leakage,
and clean-render bias; mitigate them with a written label guide, double review of ambiguous/retro
cases, source-grouped splits, and real captured photos.

## Primary references

- [Tesseract input-quality and segmentation guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)
- [Tesseract result iterator and bounding boxes](https://tesseract-ocr.github.io/tessdoc/APIExample.html)
- [OpenCV template matching](https://docs.opencv.org/4.12.0/de/da9/tutorial_template_matching.html)
- [OpenCV AKAZE/ORB planar tracking with RANSAC](https://docs.opencv.org/5.0/tutorials/features/akaze_tracking/akaze_tracking.html)
- [ONNX Runtime Node CPU platform support](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)
- [Scryfall bulk-data guidance for local workloads](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17)
- Existing repository direction: [card detection research spike](card-detection-research-spike.md)

## Verification evidence for this spike

- `pnpm check:fast`: passed repository-wide lint, formatting, and type checking.
- `pnpm test`: passed, 468 tests.
- `node scripts/benchmark-layout-signals.mjs`: passed offline over 129 unique images; temporary
  materialized transforms were removed. Two runs produced the same output SHA-256,
  `a888872744fc3d428f42d59b03dabf3ab117f8498d4049392ed5ede2bbaef609`.
- The authoritative user crop-review export was only read. Its handoff SHA-256 was
  `1b38610aa8f0b58f475cb375254689a373a4ddfd5cc9c4e1b0444d155d10f96d`.
- No production crop, OCR, matching, configuration, fixture selection, or regression expectation was
  changed by this spike. The OCR regression gate was not rerun because runtime behavior did not
  change.
