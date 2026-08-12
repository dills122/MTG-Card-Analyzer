# MTG Card Analyzer

[![CI Job](https://github.com/dills122/MTG-Card-Analyzer/actions/workflows/ci.action.yml/badge.svg)](https://github.com/dills122/MTG-Card-Analyzer/actions/workflows/ci.action.yml)
[![CodeFactor](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer/badge)](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer)

MTG Card Analyzer is a Node.js CLI that identifies Magic: The Gathering cards from images. It
combines OCR, fuzzy name matching, and perceptual image hashes to find the likely card and
printing.

It is local-first: the card-name index, image-hash cache, scan history, and optional collection
data are stored on your machine by default. No MySQL server is needed for the normal workflow.

## What it does

- Scans one card image at a time from the command line.
- Extracts and normalizes the card name with Tesseract OCR.
- Fuzzy-matches imperfect OCR against a local card-name index.
- Compares card or set-symbol image hashes to distinguish printings.
- Prints candidates by default, with opt-in local collection tracking.
- Records a local operations log to help diagnose difficult scans.

Scans are dry runs by default: they print results without adding anything to your collection. The
local caches and operations log still update unless you disable the local cache.

Local scan inputs must be JPEG, PNG, GIF, or BMP files no larger than 32 MiB, 12,000 pixels on
either axis, or 40 megapixels decoded. The scanner validates the file signature and dimensions
before decoding it; TIFF, ICNS, JXL, HEIF, and other container formats are rejected.

## Quick start

You need:

- [Node.js](https://nodejs.org/) 22.14 or newer
- npm and a network connection for the GitHub release, its dependencies, and the initial Scryfall
  card-name seed

```bash
npm install --global https://github.com/dills122/MTG-Card-Analyzer/releases/latest/download/mtg-card-analyzer-0.2.0.tgz
mtg-card-analyzer names seed
mtg-card-analyzer scan ./path/to/card.jpg
```

Run `names seed` once before the first scan. It downloads the Scryfall card-name catalog into the
local name index. Seeding is safe to repeat: it applies the same normalization contract used by
matching, rejects unmatchable catalog entries, repairs invalid or duplicate rows, and upserts names
idempotently. A required seed failure exits nonzero. The GitHub release archive installs the
`mtg-card-analyzer` command and the bundled English OCR model; the project is not published to the
npm registry. Configuration and local data use the current directory or your home configuration
directory as described in
[Configuration and local data](docs/configuration.md).

If the scan does not complete, check the environment before digging into individual settings:

```bash
mtg-card-analyzer diagnostics
```

Contributors working from a source checkout should use the
[local development setup](docs/LOCAL_DEV.md), which requires pnpm and Git.

## Common workflows

### Identify a card without changing your collection

```bash
mtg-card-analyzer scan ./path/to/card.jpg
```

You can also omit the `scan` word for backward compatibility:

```bash
mtg-card-analyzer ./path/to/card.jpg
```

### Save successful scans to a local collection

Collection tracking and writes are separate opt-ins. Set both once in `mtg.config.json` through the
CLI:

```bash
mtg-card-analyzer config set collectionEnabled true
mtg-card-analyzer config set queryingEnabled true
mtg-card-analyzer scan ./path/to/card.jpg
```

Or enable both for only one run:

```bash
mtg-card-analyzer scan ./path/to/card.jpg --enable-collection --query
```

### Inspect recent scan activity

```bash
mtg-card-analyzer log dump --limit 20
mtg-card-analyzer log stats
mtg-card-analyzer diagnostics
```

Run `mtg-card-analyzer --help` for the command list or see the
[CLI reference](docs/cli-reference.md) for every command and flag.

## How matching works

1. The image is validated and likely title regions are cropped and enhanced.
2. Tesseract extracts bounded title candidates with the segmentation mode declared by each crop.
3. All plausible OCR regions and lines are fuzzy-matched against the local card-name index;
   unambiguous individual face names resolve back to their canonical compound card name.
4. Failed title matches progressively try soft/inverted title variants, rotated title bands, and
   finally supplemental rules text, avoiding the extra OCR work for ordinary successful scans.
5. Candidate printings come from every page of the Scryfall print search and retain exact print IDs,
   set codes, collector numbers, and treatment metadata while cached or downloaded PDQ fingerprints
   rank them. A high-confidence set-symbol result wins; an inconclusive symbol comparison is retried
   with the full card instead of forcing a weak print guess.
6. Results are printed and, only when enabled, a single confirmed printing is written to the
   collection backend. A lone API candidate is not confirmation; unverified or multiple exact-print
   candidates are saved to needs-attention instead.

The scan promise includes local cache/log completion and removal of its bounded OCR temporary
directory, so the CLI does not exit while those writes or cleanup operations are still pending.

<p align="center">
  <img width="320" src="https://raw.githubusercontent.com/dills122/MTG-Card-Analyzer/master/test-images/PlatinumAngel.jpg" alt="Platinum Angel card used by the example scan">
</p>

OCR quality varies with lighting, focus, rotation, framing, and card layout. The OCR minimum is
360 by 500 pixels; a smaller source within 2x of that is still upscaled and processed, and only a
source further below is rejected. Setup and printing lookup use Scryfall, so the scanner is
local-first rather than fully offline.

## Documentation

| If you want to...                                                | Read...                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Install the project or fix a local setup problem                 | [Local development setup](docs/LOCAL_DEV.md)                  |
| Look up commands, flags, logging, migration, or collection edits | [CLI reference](docs/cli-reference.md)                        |
| Change settings or understand local database files               | [Configuration and local data](docs/configuration.md)         |
| Understand the scan pipeline and module boundaries               | [Architecture](docs/architecture.md)                          |
| Review the exact-print and variant-detection research direction  | [Card detection spike](docs/card-detection-research-spike.md) |
| Review production dependency and image-input security controls   | [Dependency security](docs/dependency-security.md)            |
| Review the Blockhash-versus-PDQ benchmark and selection          | [Fingerprint benchmark](docs/image-fingerprint-benchmark.md)  |
| Add or evaluate OCR and matching fixtures                        | [Regression testing](docs/regression-testing.md)              |
| Build a reviewed custom OCR fine-tuning corpus                   | [OCR training data](docs/ocr-training-data.md)                |
| Prepare a change or pull request                                 | [Contributing](CONTRIBUTING.md)                               |

The default NeDB backend is the recommended path. A legacy MySQL/RDS adapter remains available for
existing users; its setup and migration instructions live in the
[local development guide](docs/LOCAL_DEV.md#mysql--docker) and
[CLI reference](docs/cli-reference.md#migrate-local-data-to-mysqlrds).

## Development

After setup, run the standard local gate:

```bash
pnpm check
```

That runs formatting checks, linting, type checking, and unit tests. Changes to OCR preprocessing,
fuzzy matching, hashing, or print selection should also run:

```bash
pnpm test:regression
```

The unit suite is deterministic, ignores machine-local configuration and credentials, and does not
require live Scryfall or MySQL access. CI runs the fast/unit/coverage gate and the separate
cold-cache OCR regression on Node 22. See
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

MTG Card Analyzer is available under the [MIT License](LICENSE).
