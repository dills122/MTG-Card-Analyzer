# MTG Card Analyzer

[![CI Job](https://github.com/dills122/MTG-Card-Analyzer/actions/workflows/ci.action.yml/badge.svg)](https://github.com/dills122/MTG-Card-Analyzer/actions/workflows/ci.action.yml)
[![CodeFactor](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer/badge)](https://www.codefactor.io/repository/github/dills122/mtg-card-analyzer)

A local-first MTG card scanner for OCR + fuzzy name matching + image-hash set matching. The app scans a card image, extracts the name, finds likely card prints, and uses local caching to improve match speed/quality over time.

> Status (Feb 2026): runnable on Node 22 with Tesseract.js v3; OCR + fuzzy matching + image hashing work. The default runtime is local-first using NeDB caches.

## Example

Here is a test extraction:

### Original Card

<p align="center">
  <img width="500" height="696" src=".\test-images\PlatinumAngel.jpg" alt="Logo Image">
</p>

### Name Extraction

Extracted Text: `g Platinum Angel`

Cleaned Extracted Text: `gPlatinumAngel`

#### Before Pre Processing

<p align="center">
  <img width="500" height="100" src=".\test-images\test-extractions\8170e28d-ba4a-4918-8246-0a6c7840a330.jpg" alt="Logo Image">
</p>

#### After Pre-Processing

<p align="center">
  <img width="500" height="100" src=".\test-images\test-extractions\24b0e728-dd4b-487d-aefa-26e707566130.jpg" alt="Logo Image">
</p>

### Type Extraction

Extracted Text: `E Artifact Creature —- Angel`

Cleaned Extracted Text: `EArtifactCreatureAngel`

#### Before Pre-Processing

<p align="center">
  <img width="500" height="100" src=".\test-images\test-extractions\2312b662-a0e7-4589-bba9-62d990a6726f.jpg" alt="Logo Image">
</p>

#### After Pre-Processing

<p align="center">
  <img width="500" height="100" src=".\test-images\test-extractions\19c600f5-28ae-4599-81ee-9df8058ce8df.jpg" alt="Logo Image">
</p>

More examples are available [here](https://github.com/dills122/mtg-card-analyzer/tree/master/test-images)

## Getting Up And Running

Full setup walkthrough, troubleshooting, and Docker/MySQL instructions: **[docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)**. Quick version below.

### Prerequisites

- Node 22
- Tesseract.js v3 (npm dependency) with `eng.traineddata` available (an English traineddata is bundled at repo root)
- [Docker](https://docs.docker.com/get-docker/), only if you want the optional `rds` storage adapter

### Install

```bash
git clone https://github.com/dills122/MTG-Card-Analyzer.git
cd MTG-Card-Analyzer
node scripts/setup.mjs
```

This installs deps, creates local config files, and seeds the card names dictionary. Add `--with-mysql` to also stand up local MySQL via Docker for the `rds` storage adapter. See [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) for what it does step by step, and `node scripts/verify-env.mjs` to sanity-check the result.

### First Scan

```bash
# Run at the base directory of the repo
node index.mjs scan ./test-images/PlatinumAngel.jpg
```

### Current Commands

- `scan <filePath>` : scan a single image and output results
    - flags:
        - `--query` or `-q`: persist results (write to the collection / needs-attention tables; default `false`, dry-run otherwise). Requires `--enable-collection` too -- `--query` alone is not enough.
        - `--enable-collection`: turn on the opt-in collection/needs-attention tracking module for this run (default `false`). Not everyone scanning cards wants an inventory kept; without this, `--query` still runs the full pipeline and prints matches but persists nothing.
        - `--pretty` or `-p`: pretty logging (default `true`).
        - `--storage-adapter <nedb|rds>`: which persistence backend this run's collection/needs-attention writes go to.
        - `--card-names-db <path>`: path (dir or `.db` file) for the local card names cache.
        - `--card-hash-db <path>`: path (dir or `.db` file) for the local card hash cache.
        - `--no-local-cache`: disable the local cache (hash cache + ops log; the names dictionary is unaffected, see [Persistence Architecture](#persistence-architecture)).
        - `--config <path>`: path to a JSON config file (see [Configuration](#configuration)).
- `log dump` : print recent entries from the local operations log
    - flags: `--limit <n>` (default 50), `--since <ISO date>`, `--format <table|json>` (default `table`), `--config <path>`
- `log stats` : print aggregate stats over the local operations log (totals by decision, error count, average top match confidence)
    - flags: `--config <path>`
- `migrate` : one-shot migration of local nedb collection/needs-attention data to another backend (currently only `nedb -> rds`; always reads from local nedb regardless of the active `--storage-adapter`). Idempotent by default -- an entry already present on the target is skipped, not double-counted; `--force` re-migrates collection entries anyway (adds local quantity on top of whatever's already there). Needs-attention entries are always deduped by the target's own unique constraint.
    - flags: `--to <rds>` (required), `--dry-run` (preview without writing), `--force`, `--card-names-db <path>`, `--config <path>`
- `collection update <cardName> <cardSet>` : manually set a collection entry's quantity to an exact value (unlike scanning, this overwrites rather than adds). Errors if the entry doesn't exist -- use a scan to create one first. `estValue` is rescaled proportionally from the existing per-unit value.
    - flags: `--quantity <n>` (required), `--storage-adapter <nedb|rds>`, `--config <path>`
- `collection remove <cardName> <cardSet>` : delete a collection entry outright. Permanent, no confirmation prompt.
    - flags: `--storage-adapter <nedb|rds>`, `--config <path>`

### Persistence Architecture

Two deliberately separate tiers:

1. **Cache tier** — always on by default (turn off with `--no-local-cache` / `LOCAL_CACHE_ENABLED=false`), always local nedb, never `STORAGE_ADAPTER`-selected. Holds the card names dictionary, the image hash cache, and the local [operations log](#operations-log). Its job is speed (skip re-querying Scryfall, skip re-hashing known cards) and local diagnostics — not being a source of truth. The names dictionary specifically is unaffected by `--no-local-cache`: it's a required local index, not an optional cache, since there's no remote alternative.
2. **Persistence tier** — selected by `STORAGE_ADAPTER` (`nedb` | `rds`, default `nedb`). This is where your actual collection and needs-attention records live. Gated behind the opt-in collection module (`--enable-collection` / `COLLECTION_ENABLED=true` / `collectionEnabled` in the config file, off by default) -- `scan --query` alone runs the full pipeline and prints matches but persists nothing until the module is also on. Explicitly running `collection update`/`remove` or `migrate` doesn't need the flag re-passed; naming those commands is itself the opt-in for that invocation. Scanning the same card twice adds to its quantity (`delta`, default 1) rather than overwriting it — both backends compute the resulting `estValue` from the final quantity. Made a mistake, or want to correct/remove an entry by hand? `collection update`/`collection remove` (see [Current Commands](#current-commands)) go through the same tier.

Local cache DB files:

- Name dictionary: env var `CARD_NAMES_DB_PATH`, file default `cardNames.db`
- Hash cache: env var `CARD_HASH_DB_PATH` (falls back to `CARD_NAMES_DB_PATH` if unset), file default `card-hashes.db`
- Operations log: shares the names dictionary's path, file default `operations.db`
- Either DB path env var can be a directory (app appends the default filename) or a full `.db` file path.

Local persistence tier DB files (nedb adapter only — `rds` writes to MySQL instead):

- Collection: `collection.db`, same path resolution as the names dictionary
- Needs-attention: `needs-attention.db`, same path resolution as the names dictionary

Temp image snippets are written to system temp and cleaned up per run.

### Storage Adapter

Select the persistence-tier adapter with (in order of precedence, highest wins):

- CLI flag: `--storage-adapter rds`
- env var: `STORAGE_ADAPTER=rds`
- config file: `{ "storageAdapter": "rds" }`
- default: `nedb`

`rds` is optional/legacy — see [MySQL / RDS](#mysql--rds-optional-legacy).

### Operations Log

Every scan appends one entry to the local operations log (part of the cache tier, nedb, always local): input file, extracted OCR text, name-match candidates + confidence, what happened (`collection` / `needs-attention` / `no-match` / `dry-run` / `error`), and any error. Inspect it with:

```bash
node index.mjs log dump --limit 20
node index.mjs log dump --format json --since 2026-01-01
node index.mjs log stats
```

This is what issue #49 ("Transaction") became — the old model was a half-defined mix of a generic audit log and art/flavor-match-confidence tracking that never got finished; the art/flavor fields belong to #50 instead.

### Configuration

All runtime settings resolve through a single config module ([src/config/index.mjs](src/config/index.mjs)). Precedence, highest wins:

1. CLI flags (e.g. `--storage-adapter`, `--card-names-db`, `--card-hash-db`, `--no-local-cache`, `--enable-collection`)
2. Env vars (`STORAGE_ADAPTER`, `CARD_NAMES_DB_PATH`, `CARD_HASH_DB_PATH`, `LOCAL_CACHE_ENABLED`, `COLLECTION_ENABLED`)
3. Config file (JSON)
4. Built-in defaults

Config file is picked up from, in order: an explicit `--config <path>`, then `MTG_CONFIG_PATH` env var, then `./mtg.config.json` (cwd), then `~/.mtg-card-analyzer/config.json`. See [mtg.config.example.json](mtg.config.example.json) for the shape — copy it to `mtg.config.json` and edit.

Note: MySQL/RDS credentials (host/port/user/password/database) are separate, in `secure.config.cjs` at repo root (loaded by [src/rds/connection.mjs](src/rds/connection.mjs)) — kept out of the general config file/repo since they're secrets, not app settings. `port` is optional, defaults to MySQL's standard port.

Test images are provided at `test-images`

Backfiller utility instructions found [here](https://github.com/dills122/MTG-Card-Analyzer/wiki/Backfiller)

### Troubleshooting

Run `node scripts/verify-env.mjs` first — it checks Node version, required files, local cache writability/seeding, and (with `--with-mysql`) the MySQL connection, in one shot. Full troubleshooting guide: [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md#troubleshooting).

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

### OCR Regression Benchmarks

The labeled, offline image regression suite covers clean scans, photo-like degradation,
poor lighting, blur, rotation, cropping, and low resolution:

```bash
# Generate a report without failing the command for known regressions
pnpm regression

# CI-style gate: exit non-zero if any blocking fixture misses its expectations
pnpm test:regression
```

Reports are written to `artifacts/regression/benchmark.md` and `benchmark.json`.
Fixture labels, expected card data, and offline print references live in
`test/regression/fixtures/manifest.json`. See
[`docs/regression-testing.md`](docs/regression-testing.md) for the audit, manifest format,
quality labels, and fixture workflow. Newly scaffolded images stay disabled until their
`CHANGE_ME` values are labeled and both manifest entries are enabled.

Import new clean-scan candidates from Scryfall by set code or release-date range:

```bash
# Preview six unused prints from two sets
pnpm fixtures:import --set fin --set dsk --count 6 --dry-run

# Preview a deterministic coverage mix across sets, colors, types, rarities, and treatments
pnpm fixtures:import --set m12 --set m13 --set m20 --count 12 --balanced --dry-run

# Download ten unused prints and append disabled review entries
pnpm fixtures:import \
    --released-after 2025-01-01 \
    --released-before 2025-06-30 \
    --count 10
```

The target manifest is automatically used to exclude existing printings. Add repeatable
`--existing-manifest <path>` options to exclude catalogs from other checkouts or suites. See the
[regression fixture import workflow](docs/regression-testing.md#import-clean-scans-from-scryfall)
for balanced-selection behavior, review, activation, and safety details.

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

# Sanity-check the local dev environment (Node version, required files, seeded DB)
pnpm verify
node scripts/verify-env.mjs --with-mysql   # same, plus checks the MySQL connection
```

### MySQL / RDS (Optional, Legacy)

MySQL scripts and modules exist in `src/rds` and `src/data/scripts/sql` for the collection and needs-attention tables (`CardCollection`, `Card_NEED_ATTN`) -- select with `--storage-adapter rds`. The default runtime path is local-first NeDB; treat RDS as optional/legacy until sync/backup mode is formalized. Verified against a real MySQL 8 instance as part of building this.

Started with `nedb` and want to move to `rds`? `node index.mjs migrate --to rds` copies your local collection/needs-attention data over (see [Current Commands](#current-commands)).

```bash
node scripts/setup.mjs --with-mysql   # one-shot: docker compose up + pnpm setup-db, matching creds
# -- or manually --
pnpm docker:up                        # start local MySQL (docker-compose.yml)
pnpm setup-db                         # create tables (needs secure.config.cjs, see Configuration)
pnpm docker:down                      # stop it (data persists in a named volume)
docker compose down -v                # stop it AND wipe the volume
```

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
