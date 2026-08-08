# OCR regression testing

The regression suite runs the production image preprocessing, Tesseract OCR, fuzzy name
matching, and perceptual-hash print selection without calling Scryfall, MySQL, NeDB, or any
other live or persistent service. It produces both a readable Markdown benchmark and
machine-readable JSON.

## Infrastructure audit

The existing scan path already had strong reusable pieces:

- `src/image-processing/ocr-preprocessing.mjs` crops three likely name regions and applies
  grayscale, normalization, scaling, thresholding, inversion, and sharpening.
- `src/image-analysis/extract-text.mjs` runs Tesseract on those variants and selects the
  highest-confidence OCR result. The audit also found that Tesseract v3's default cache mode
  could race while rewriting the bundled `eng.traineddata`; OCR now opens that cache read-only.
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

Every regression case is evaluated cold. Image hashes are recomputed for both the fixture and
every candidate reference image; the runner has no in-memory or persistent hash cache. Fixture
names are injected before the fuzzy matcher can initialize NeDB. Tesseract runs with
`cacheMethod: none` and reads the repository's bundled `eng.traineddata` directly, so it neither
reads nor writes an OCR cache. Unnecessary OCR previews are disabled. Synthetic transformations
use a per-case temporary directory only when needed, and that directory is deleted after the
case. The Markdown and JSON benchmark reports are the only durable files written by the runner.

Images below 360 by 500 pixels are rejected by current production preprocessing. Keep
low-resolution fixtures above that hard boundary unless the expected result is the validation
failure itself.

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
```

Execution is sequential so OCR timing and CPU contention are easier to compare between runs.
The generated `artifacts/regression` directory is ignored by Git.

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
seven vintage fixtures are temporarily non-blocking while GitHub issue #157 tracks a dedicated
vintage-card recognition flow. All other enabled fixtures gate pull requests.

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
```

Choose either one or more `--set` values or release-date bounds. Set values may be repeated or
comma-separated. Results use unique printings, newest first. The target manifest's catalog is
always used as the existing-card list; each repeatable `--existing-manifest` adds another catalog
to that exclusion set. Prints match by Scryfall ID when available and by set plus collector number,
so older manifest entries without an ID are still excluded.

The command writes images under `test-images/regression/scryfall/` and atomically updates
`test/regression/fixtures/manifest.json`. Imported catalog and case entries are disabled to preserve
the review-first fixture policy. To finish an import:

1. Review the downloaded image and Scryfall metadata.
2. Find the new entries with
   `rg -n "Imported from Scryfall" test/regression/fixtures/manifest.json`.
3. Set both the catalog and case `enabled` fields to `true`.
4. Run the new case by ID and inspect both benchmark reports.
5. Adjust thresholds from repeated evidence, then run the full unit and regression gates.

The importer accepts at most 100 cards per run, follows at most 20 result pages by default, stops
as soon as enough unused printable cards are found, spaces API page requests by 125 ms, and rejects
oversized or non-JPEG downloads. Use `--max-pages` only when a selection contains many already
tracked or multi-face prints. Scryfall asks API clients to stay below 10 requests per second and to
send identifying request headers; see their
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

Each case records raw and normalized OCR text, Tesseract confidence and winning region, fuzzy
name matches, name-candidate count, print-candidate count, the selected print, its three hash
comparison metrics, set/collector verification, failures, per-stage timing, and total runtime.
The summary includes pass rate, the blocking CI-gate result, non-blocking failure counts,
disabled and placeholder fixture counts, totals by quality, total/mean runtime, and p95 runtime.

## Pull request gate

The `regression_job` in `.github/workflows/ci.action.yml` runs the full cold-cache suite for every
pull request targeting `master` or `main`. It uploads `benchmark.md` and `benchmark.json` as a
GitHub Actions artifact even when the gate fails. Application persistence, image-hash caching,
and OCR caching remain disabled in CI exactly as they are locally.
