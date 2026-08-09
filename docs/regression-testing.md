# OCR regression testing

The regression suite runs the production image preprocessing, Tesseract OCR, fuzzy name
matching, and perceptual-hash print selection without calling Scryfall, MySQL, NeDB, or any
other live or persistent service. It produces both a readable Markdown benchmark and
machine-readable JSON.

## Infrastructure audit

The existing scan path already had strong reusable pieces:

- `src/image-processing/ocr-preprocessing.mjs` crops four likely name regions and applies
  grayscale, normalization, scaling, thresholding, inversion, and sharpening. Failed matches can
  request bounded soft/inverted or rotated title variants.
- `src/image-analysis/extract-text.mjs` runs Tesseract with each crop's declared page-segmentation
  mode and preserves bounded region, line, and token-window candidates. One bounded Tesseract
  worker loads the pinned official `tessdata_best` English LSTM model. The LSTM-only archive does
  not contain the obsolete `enable_new_segsearch` or `save_raw_choices` legacy directives.
- `src/fuzzy-matching/match-name.mjs` applies the production fuzzy-name thresholds.
- `src/image-hashing/hash-image.mjs` provides the production perceptual hash and comparison
  metrics.
- Existing tests isolate most external operations with Sinon, and `test-images` contains
  useful high-resolution scans.

The production print matcher is not deterministic enough for a regression suite by itself:
it searches the live Scryfall API and can download remote card images. The local name store
also depends on a separately seeded NeDB database. The regression runner therefore injects
names from the fixture catalog and compares against local reference images. This exercises
the same OCR, fuzzy matcher, and hash implementation while keeping the input corpus fixed.

<!-- markdownlint-disable MD013 -->

Every regression case is evaluated with cold application state. Image hashes are recomputed for
both the fixture and every candidate reference image; the runner has no in-memory or persistent
hash cache. Fixture names are injected before the fuzzy matcher can initialize NeDB. Tesseract
runs with `cacheMethod: none` and reads the bundled `eng.traineddata`, so it neither reads nor writes
an OCR cache. One initialized Tesseract worker is shared sequentially by all selected cases and
terminated after the run. This avoids loading the OCR engine and language model for every crop. The
worker's adaptive recognition state is reset before each crop. OCR results remain independent of
earlier fixtures, and the persistent language-data cache stays off.
Unnecessary OCR previews are disabled. Synthetic transformations use a per-case temporary
directory only when needed, and that directory is deleted after the case. The Markdown and JSON
benchmark reports are the only durable files written by the runner.

<!-- markdownlint-enable MD013 -->

Production preprocessing requires 360 by 500 pixels; a source within 2x of that minimum is
upscaled and still processed (see `smartCrop.assertOcrSourceSizeOk`), and only a source further
below is rejected. Keep low-resolution fixtures within the recoverable range unless the expected
result is the validation failure itself.

## Run the suite

```bash
# Benchmark mode: always writes reports and allows known failures
pnpm regression

# Gate mode: exits 1 when one or more blocking expectations fail
pnpm test:regression

# Run one or more fixtures
pnpm test:regression --case pacifism-clean-scan --case pacifism-blur

# Run one or more quality groups
pnpm test:regression --quality clean-scan --quality low-resolution

# Use another manifest or output directory
pnpm test:regression --manifest ./path/manifest.json --output ./path/reports

# Run against another reviewed OCR candidate
pnpm test:regression \
    --ocr-model-manifest ./path/to/ocr-models.json \
    --ocr-model official-eng-fast
```

Execution stays sequential to keep OCR timings and CPU contention comparable.

Run multiple fixture IDs or quality groups in one command to reuse its worker.
Each separate command starts a new worker.

The generated `artifacts/regression` directory is ignored by Git.

## OCR model candidates

The default run loads `test/regression/ocr-models/manifest.json` and verifies the bundled control
model's SHA-256 before starting Tesseract. Every candidate must identify its source URL and revision,
license, model family, compatible Tesseract.js version, exact byte hash, and a local file named
`eng.traineddata`. Candidate files are capped at 128 MiB and loaded with the OCR cache disabled.

Keep each candidate in its own directory because Tesseract.js resolves English data as
`<langPath>/eng.traineddata`. The benchmark JSON records the selected candidate's safe provenance,
hash, and size; it does not record the candidate's local filesystem path. The Markdown report shows
the candidate ID, family, abbreviated hash, and size.

Candidate acquisition remains an explicit review step; the regression command does not download or
replace model data. Prefer candidates from Tesseract's official
[`tessdata`, `tessdata_fast`, and `tessdata_best` repositories](https://github.com/tesseract-ocr/tessdoc/blob/main/Data-Files.md).
Keep the Tesseract.js/core version fixed during a model comparison because its official guidance
notes that settings, language data, and engine version must all match for comparable output:
[Tesseract.js FAQ](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md).

### Compare completed model runs

Run every model against the same fixture manifest and filters, write each run to a separate output
directory, then compare their JSON reports:

```bash
pnpm regression:compare \
    --control artifacts/regression/models/bundled-eng-control/benchmark.json \
    --candidate artifacts/regression/models/official-eng-fast/benchmark.json \
    --candidate artifacts/regression/models/official-eng-best/benchmark.json \
    --output artifacts/regression/models/comparison
```

The comparator refuses reports with different fixture ID sets. Its Markdown and JSON outputs show
accuracy, blocking-gate, runtime, and model-size deltas plus every fixture whose pass/fail result
changed. A model with a blocking regression is reported as a failed candidate even when its overall
pass count increases.

### Pinned upstream bakeoff: 2026-08-08

The first controlled bakeoff kept Tesseract.js at 3.0.3 and ran all 79 enabled fixtures sequentially
with OCR caching disabled. Timings are from one local run and should be treated as directional; the
accuracy and fixture deltas are the promotion gate.

| Model                    |      Size | Passed | Blocking | Mean runtime | P95 runtime |
| ------------------------ | --------: | -----: | -------: | -----------: | ----------: |
| Bundled control          | 20.86 MiB |  74/79 |    72/72 |   1026.22 ms |  2145.50 ms |
| Official `tessdata_fast` |  3.92 MiB |  72/79 |    70/72 |    869.48 ms |  1907.77 ms |
| Official `tessdata_best` | 14.69 MiB |  75/79 |    71/72 |   1063.18 ms |  2318.91 ms |

Pinned inputs:

- `tessdata_fast` revision `87416418657359cb625c412a48b6e1d6d41c29bd`, SHA-256
  `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`
- `tessdata_best` revision `e12c65a915945e4c28e237a9b52bc4a8f39a0cec`, SHA-256
  `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`

`tessdata_fast` fixed one non-blocking vintage fixture but regressed Worldly Tutor and the blocking
Sarkhan Unbroken and Yavimaya Coast fixtures. `tessdata_best` fixed two non-blocking vintage fixtures
but regressed the blocking Sarkhan Unbroken fixture. Neither candidate is eligible to replace the
bundled control.

Use the pinned `tessdata_best` model as the base for the custom-training experiment. Tesseract's
official data-file guidance identifies `tessdata_best` as the float model intended for fine-tuning;
`tessdata_fast` is an integer model that cannot be used as a training base. A trained candidate must
return to this same comparison gate before any production promotion.

### Production LSTM promotion: 2026-08-09

The original production bundle was a 20.86 MiB Pre-4.0 legacy-only archive. A current-format
replacement bakeoff ran the complete 125-case corpus with Tesseract.js fixed at 3.0.3:

| Model                         |      Size |  Passed | Blocking | Mean runtime | P95 runtime |
| ----------------------------- | --------: | ------: | -------: | -----------: | ----------: |
| Pre-4.0 bundled control       | 20.86 MiB | 124/125 |  118/118 |   1816.00 ms |  8010.73 ms |
| Official `tessdata_best` LSTM | 14.69 MiB | 123/125 |  118/118 |   1503.16 ms |  4151.01 ms |

The LSTM model preserved every blocking result, removed 6.18 MiB from the bundle, and reduced the
directional mean and p95 runtimes. Its only regression was the already non-blocking Mirage
`Illumination` fixture. The official combined `tessdata` model produced the same pass set while
growing to 22.38 MiB, so the smaller LSTM-only model was selected.

Production now pins `tessdata_best` revision
`e12c65a915945e4c28e237a9b52bc4a8f39a0cec`, SHA-256
`8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`. The runtime diagnostics
verify that exact hash, and the regression candidate manifest records the same source and engine
provenance. Timings are directional local measurements; the zero-blocking-regression result is the
promotion gate.

## Manifest

Edit `test/regression/fixtures/manifest.json`. Paths are relative to the manifest file. The
manifest has two lists:

- `catalog` is the fixed offline print catalog. Each print needs `name`, `set`,
  `collectorNumber`, and `referenceImage`. Any extra card fields may be asserted through
  `expected.metadata`.
- `cases` labels an input image and its expected result. Case IDs must be unique.

Newly discovered images can be scaffolded with `enabled: false` and `CHANGE_ME` values. Disabled
catalog entries and cases are validated for file paths but excluded from OCR, matching, and the
pass/fail total. The report separately shows disabled fixtures and fixtures that still contain
`CHANGE_ME` placeholders.

Cases are blocking by default. Add `"blocking": false` only for a known, tracked limitation that
must remain visible in every benchmark without failing CI. Non-blocking cases still run, retain
their ordinary pass/fail result, and appear as `NON-BLOCKING FAIL` in the Markdown report. The
seven vintage fixtures are temporarily non-blocking while GitHub issue #157 tracks the remaining
vintage-card recognition work. The current LSTM benchmark recognizes five of those seven; the
vintage `Island` and `Illumination` fixtures remain known misses. All other enabled fixtures gate
pull requests.

Minimal example:

```json
{
    "version": 1,
    "catalog": [
        {
            "name": "Pacifism",
            "set": "BBD",
            "collectorNumber": "101",
            "typeLine": "Enchantment — Aura",
            "referenceImage": "../../../test-images/Pacifism.jpg"
        }
    ],
    "cases": [
        {
            "id": "pacifism-clean-scan",
            "image": "../../../test-images/Pacifism.jpg",
            "quality": "clean-scan",
            "expected": {
                "name": "Pacifism",
                "set": "BBD",
                "collectorNumber": "101",
                "minNameScore": 0.7,
                "maxNameCandidates": 5,
                "maxPrintCandidates": 1,
                "minPrintScore": 0.75,
                "minOcrConfidence": 50,
                "maxRuntimeMs": 30000,
                "metadata": {
                    "typeLine": "Enchantment — Aura"
                }
            }
        }
    ]
}
```

Only `name`, `set`, and `collectorNumber` are required inside `expected`. Optional thresholds
let the suite catch candidate explosions, confidence changes, metadata regressions, and large
runtime regressions without requiring an exact OCR string. Print selection uses a weighted
score over the production hash metrics and defaults to a minimum score of 0.75.

## Quality labels and transformations

Every case uses exactly one of these labels:

- `clean-scan`
- `good-photo`
- `average-photo`
- `poor-lighting`
- `blur`
- `rotation`
- `cropping`
- `low-resolution`

For a real captured image, omit `transform`; the image is passed directly to preprocessing.
For repeatable synthetic degradation, add any combination of:

```json
{
    "transform": {
        "brightness": -0.2,
        "contrast": -0.1,
        "blur": 2,
        "rotate": 2.5,
        "crop": { "left": 0.02, "top": 0.01, "right": 0.02, "bottom": 0.03 },
        "resize": { "width": 360, "height": 502 }
    }
}
```

Brightness and contrast use Jimp values from -1 to 1. Blur is a positive integer radius,
rotation is in degrees, crop values are fractions of the image edge, and resize values are
pixels. Transformed images exist only in a temporary directory and are removed after each
case.

The seed manifest derives each quality class from the existing Pacifism scan and also labels
the existing Fireball, Platinum Angel, Shivan Dragon, and Unsummon scans. This makes the suite
useful immediately without duplicating binary files. Synthetic photo degradations are stable
proxies, not substitutes for device coverage. Add real good, average, and poor photos as they
become available.

## Add a fixture

### Import clean scans from Scryfall

Use the importer to select recent card prints, download Scryfall's normal front JPEG, and append
matching catalog and clean-scan case entries:

```bash
# Preview newest prints from several sets without writing files
pnpm fixtures:import --set fin --set dsk --count 6 --dry-run

# Preview a deterministic coverage mix instead of collector-number ordering
pnpm fixtures:import \
    --set m12 --set m13 --set m20 \
    --count 12 \
    --balanced \
    --dry-run

# Import prints whose sets were released in a date range
pnpm fixtures:import \
    --released-after 2025-01-01 \
    --released-before 2025-06-30 \
    --count 10

# Exclude prints tracked by another regression manifest too
pnpm fixtures:import \
    --set fin \
    --count 5 \
    --existing-manifest ../other-checkout/test/regression/fixtures/manifest.json

# Re-run an identical selection later (debugging, or reproducing a CI failure)
pnpm fixtures:import --set fin --set dsk --count 6 --seed 20260808 --dry-run
```

Choose either one or more `--set` values or release-date bounds. Set values may be repeated or
comma-separated. Results use unique printings ordered newest-first within each fetched result page,
but each run lands on a random page of the full result set (wrapping back to page one if the random
start runs off the end) and shuffles the candidate pool before selecting. This is deliberate: a wide
`--set` list or release-date range can span thousands of prints, and always starting at page one
would return the same newest set on every run. Pass `--seed <number>` to make the random page and
shuffle reproducible across runs (same seed, same inputs, same selection). Add `--balanced` to fetch
the bounded candidate pool and greedily favor underrepresented sets, color categories, primary card
types, rarities, layouts, and treatments; it draws from the same randomized pool, so vary `--seed`
(or omit it) to get a different balanced mix. Balanced selection prefers non-basic cards and selects
at most one basic land. Its dry-run output lists the coverage categories for every card and
summarizes the number of distinct values. It also prefers a new card name over another printing of a
name already selected in that run.

The target manifest's catalog is always used as the existing-card list; each repeatable
`--existing-manifest` adds another catalog to that exclusion set. Prints match by Scryfall ID when
available and by set plus collector number, so older manifest entries without an ID are still
excluded. New catalog and expected-metadata entries retain the selected card's colors, layout, and
derived treatment style so the coverage intent remains visible after import.

The command writes images under `test-images/regression/scryfall/` and atomically updates
`test/regression/fixtures/manifest.json`. Imported catalog and case entries are disabled to preserve
the review-first fixture policy. To finish an import:

1. Review the downloaded image and Scryfall metadata.
2. Find the new entries with
   `rg -n "Imported from Scryfall" test/regression/fixtures/manifest.json`.
3. Set both the catalog and case `enabled` fields to `true`.
4. Run the new case by ID and inspect both benchmark reports.
5. Adjust thresholds from repeated evidence, then run the full unit and regression gates.

The importer accepts at most 100 cards per run, follows at most 20 result pages by default from its
randomly chosen start page, spaces API page requests by 125 ms, and rejects oversized or non-JPEG
downloads. Newest-first mode stops as soon as enough unused printable cards are found; balanced mode
reads the bounded result pool before choosing. Use `--max-pages` only when a selection contains many
already tracked or multi-face prints, or when a small `--set` list needs a wider search window to
wrap all the way around. Scryfall asks API clients to stay below 10 requests per second and to send
identifying request headers; see their
[API access guidance](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17).

### Add a captured image manually

1. Put the original image in the root-level `test-images/` directory.
2. Find the matching disabled catalog and case entries by searching for `CHANGE_ME`:

    ```bash
    rg -n CHANGE_ME test/regression/fixtures/manifest.json
    ```

3. Replace every placeholder for that image, confirm its `quality`, and change both `enabled`
   values to `true`.
4. For multiple prints of one card name, add each print with
   its own clean local `referenceImage`; the runner ranks all of them.
5. Run that case with `pnpm test:regression --case <id>`.
6. Inspect both the OCR output and candidate details in `benchmark.json`. Set thresholds from
   repeated local runs; do not copy a one-off runtime as a tight limit.
7. Run `pnpm test` for framework tests and `pnpm test:regression` for the full corpus.

Do not point catalog reference images at HTTP URLs. Keeping all references local is what makes
the regression suite repeatable and independent of API availability or Scryfall data changes.

## Report fields

Each case records the raw and normalized OCR text promoted from the title candidate that produced
the selected name match, Tesseract confidence and region, fuzzy name matches, name-candidate count,
print-candidate count, the selected print, its three hash
comparison metrics, set/collector verification, failures, per-stage timing, and total runtime.
The summary includes pass rate, the blocking CI-gate result, non-blocking failure counts,
disabled and placeholder fixture counts, totals by quality, total/mean runtime, and p95 runtime.

## Pull request gate

The `regression_job` in `.github/workflows/ci.action.yml` runs the full cold-cache suite for every
pull request targeting `master` or `main`. It uploads `benchmark.md` and `benchmark.json` as a
GitHub Actions artifact even when the gate fails. Application persistence, image-hash caching,
and OCR caching remain disabled in CI exactly as they are locally.
