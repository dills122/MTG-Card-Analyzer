# MTG Card Analyzer

[![CI Job](https://github.com/dills122/MTG-Card-Analyzer/actions/workflows/ci.action.yml/badge.svg)](https://github.com/dills122/MTG-Card-Analyzer/actions/workflows/ci.action.yml)
[![CodeFactor](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer/badge)](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer)

A local-first MTG card scanner for OCR + fuzzy name matching + image-hash set matching. The app scans a card image, extracts the name, finds likely card prints, and uses local caching to improve match speed/quality over time.

> Status (Feb 2026): runnable on Node 22 with Tesseract.js v3; OCR + fuzzy matching + image hashing work. The default runtime is local-first using NeDB caches.

## Example

Here is a test extraction:

### Original Card

<p align="center">
  <img width="500" height="696" src=".\src\test-images\PlatinumAngel.jpg" alt="Logo Image">
</p>

### Name Extraction

Extracted Text: `g Platinum Angel`

Cleaned Extracted Text: `gPlatinumAngel`

#### Before Pre Processing

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\8170e28d-ba4a-4918-8246-0a6c7840a330.jpg" alt="Logo Image">
</p>

#### After Pre-Processing

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\24b0e728-dd4b-487d-aefa-26e707566130.jpg" alt="Logo Image">
</p>

### Type Extraction

Extracted Text: `E Artifact Creature —- Angel`

Cleaned Extracted Text: `EArtifactCreatureAngel`

#### Before Pre-Processing

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\2312b662-a0e7-4589-bba9-62d990a6726f.jpg" alt="Logo Image">
</p>

#### After Pre-Processing

<p align="center">
  <img width="500" height="100" src=".\src\test-images\test-extractions\19c600f5-28ae-4599-81ee-9df8058ce8df.jpg" alt="Logo Image">
</p>

More examples are available [here](https://github.com/dills122/mtg-card-analyzer/tree/master/src/test-images)

## Getting Up And Running

### Prerequisites

- Node 22
- Tesseract.js v3 (npm dependency) with `eng.traineddata` available (an English traineddata is bundled at repo root)

### Install

- Clone: `git clone https://github.com/dills122/MTG-Card-Analyzer.git`
- Install deps: `npm i`
- Seed local name dictionary (NeDB): `node ./src/db-local/bulk-insert.mjs`

### First Scan

After install + seed, run:

```
# Run at the base directory of the repo
node index.mjs scan ./src/test-images/PlatinumAngel.jpg
```

### Current Commands

- `scan <filePath>` : scan a single image and output results
    - flags:
        - `--query` or `-q`: enable additional persistence flows used by legacy paths (default `false`).
        - `--pretty` or `-p`: pretty logging (default `true`).

### Local Storage (NeDB)

- Name dictionary DB:
    - env var: `CARD_NAMES_DB_PATH`
    - file default: `cardNames.db`
- Hash cache DB:
    - env var: `CARD_HASH_DB_PATH` (falls back to `CARD_NAMES_DB_PATH` if unset)
    - file default: `card-hashes.db`
- You can set either env var to:
    - a directory (app will append the default filename), or
    - a full `.db` file path.
- Temp image snippets are written to system temp and cleaned up per run.

### Storage Adapter

- The app now uses a storage abstraction layer.
- Default adapter: `nedb`
- Alternate adapter available: `rds` (legacy/optional)
- Select adapter with:
    - `STORAGE_ADAPTER=nedb` (default)
    - `STORAGE_ADAPTER=rds`

Test images are provided at `src\test-images`

Backfiller utility instructions found [here](https://github.com/dills122/MTG-Card-Analyzer/wiki/Backfiller)

### Troubleshooting

- `Error: No matches found` on known cards:
    - Usually means the local names DB is empty or pointing at the wrong path.
    - Re-seed names: `node ./src/db-local/bulk-insert.mjs`
    - Verify path by setting it explicitly:
        - `CARD_NAMES_DB_PATH=/absolute/path/to/db-or-dir node index.mjs scan ./src/test-images/QueenMarchesa.png`
- Seeing warnings from tesseract params:
    - Those warnings are noisy but non-fatal in current runtime.

### Running Tests

```
npm test
```

Tests stub external calls; no MySQL required.

### Test Coverage

```bash
# Run tests with coverage report (text + html + lcov, written to coverage/)
pnpm coverage

# Same, but fail the run if thresholds in the "c8" package.json block aren't met
pnpm coverage:check
```

No coverage thresholds are enforced yet — baseline is being established, see [#31](https://github.com/dills122/MTG-Card-Analyzer/issues/31).

### Quality Commands

```bash
# Lint only
pnpm lint

# Auto-fix lint issues where possible
pnpm lint:fix

# Check formatting
pnpm prettier:check

# Write formatting fixes
pnpm format

# Type checking (no emit)
pnpm typecheck

# Fast quality gate (lint + prettier + typecheck)
pnpm check:fast

# Full local gate (check:fast + tests)
pnpm check
```

### MySQL / RDS (Optional, Legacy)

MySQL scripts and modules still exist in `src/rds` and `src/data/scripts/sql`, but the default runtime path is local-first NeDB. Treat RDS as optional/legacy until sync/backup mode is formalized.

### TypeScript Migration (incremental)

- TypeScript tooling is configured to allow JavaScript (`allowJs`) and to only typecheck (`noEmit`) so you can start migrating file-by-file.
- Run `npm run typecheck` (or `pnpm typecheck`) to get type feedback without touching the runtime.
- Future `.ts` files can live alongside existing `.js` under `src/` and will be picked up automatically.

### Packages Under the Hood

- `fuzzyset.js`
- `image-hash`
- `jimp`
- `string-similarity`
- `tesseract.js`
