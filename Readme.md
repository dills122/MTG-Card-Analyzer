# MTG Card Analyzer

[![CI Job](https://github.com/dills122/MTG-Card-Analyzer/actions/workflows/ci.action.yml/badge.svg)](https://github.com/dills122/MTG-Card-Analyzer/actions/workflows/ci.action.yml)
[![CodeFactor](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer/badge)](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer)

A collectors dream application, that gives you the ability to take pictures of your cards and have them instantly be recognized and added to your collection. This app will scan each image uploaded attempt to grab the name of the card and analyze the set image in an attempt to match it with a given set.

> Status (Jan 2026): runnable on Node 16 with Tesseract.js v3; OCR + fuzzy matching + image hashing work. DB writes are now opt-in (off by default) while we stabilize.

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

- Node 16
- Tesseract.js v3 (npm dependency) with `eng.traineddata` available (an English traineddata is bundled at repo root)
- Optional: MySQL 8+ if you want to persist collections/needs-attention and hash cache

### Install

- Clone: `git clone https://github.com/dills122/MTG-Card-Analyzer.git`
- Install deps: `npm i`
- Seed local name dictionary (NeDB): `node ./src/db-local/bulk-insert.js`

### Configure MySQL (optional, only if you want writes)

- Create an RDS instance (or local MySQL). SQL scripts live in `src/data/scripts/sql`.
- Create `secure.config.js` (template: `secure.config.template.js`) with:

```
rds: {
    host: '...',
    database: '...',
    user: '...',
    password: '...'
}
```

Example local container:

```bash
docker run -d --name mtg-db -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootPass122! \
  -e MYSQL_DATABASE=MtgCardCatalog \
  -e MYSQL_USER=app_user \
  -e MYSQL_PASSWORD=app_pass100! \
  mysql:8.0
```

### First Test Run

Once all of the setup is complete to run your first image through the processor you can use one of the test images or use the given command below.

```
# Run at the base directory of the repo
node index.js scan ./src/test-images/PlatinumAngel.jpg
```

### Current Commands

- `scan <filePath>` : scan a single image and output results
    - flags:
        - `--query` or `-q`: enable database writes (default `false`). When false, runs read-only and skips inserts.
        - `--pretty` or `-p`: pretty logging (default `true`).

Notes:

- If you want NeDB to write somewhere else (e.g., CI), set `CARD_NAMES_DB_PATH=/tmp`.
- Temp image snippets are written to the system temp dir and cleaned up per run.

Test images are provided at `src\test-images`

Backfiller utility instructions found [here](https://github.com/dills122/MTG-Card-Analyzer/wiki/Backfiller)

### Running Tests

```
npm test
```

Tests stub external calls; no MySQL needed. If you set a custom NeDB path for tests, export `CARD_NAMES_DB_PATH=/tmp`.

### Packages Under the Hood

- `fuzzyset.js`
- `image-hash`
- `jimp`
- `string-similarity`
- `tesseract.js`
