# Architecture

MTG Card Analyzer keeps command parsing, matching decisions, network access, and persistence in
separate modules. The default runtime is a local-first Node.js CLI with Scryfall-backed print
matching and an optional legacy MySQL backend.

## Scan pipeline

1. `index.mjs` parses the command and resolves configuration.
2. `src/image-processing/` validates the input and produces bounded hard title crops.
3. `src/image-analysis/` runs Tesseract with each crop's declared segmentation mode and preserves
   plausible region and line candidates.
4. `src/fuzzy-matching/` ranks all title candidates from the local card-name index and maps
   unambiguous face-name aliases back to canonical compound names.
5. When matching fails, `src/processor/` progressively requests soft/inverted title crops, rotated
   title bands, and supplemental rules text.
6. `src/matcher/` obtains candidate printings through `src/scryfall-api/` and compares cached or
   remote image hashes.
7. `src/processor/` chooses dry-run, collection, needs-attention, or error behavior.
8. `src/storage/` records local diagnostics and, when explicitly enabled, collection data.

The image, network, filesystem, and database boundaries remain outside the pure name-normalization
and matching decisions so those decisions can be tested deterministically.

## Storage boundaries

There are two deliberately separate storage tiers plus one required local index:

### Name index

`cardNames.db` is the local fuzzy-match dictionary seeded from Scryfall during setup. It remains in
use even when `localCacheEnabled` is false because there is no remote name-matching fallback.

### Cache tier

The cache tier is local NeDB and does not follow `storageAdapter`. It contains:

- `card-hashes.db`, which keeps reusable hashes for known printings
- `operations.db`, which records scan decisions and troubleshooting context

It is enabled by default and can be disabled with `--no-local-cache` or
`LOCAL_CACHE_ENABLED=false`.

Cache writes are asynchronous but part of scan completion: hash upserts and the operations-log
record settle before the CLI exits. A cache failure remains non-fatal to identification and is
reported through the logger. Backfill reports success only after all of its hash upserts complete.

### Persistence tier

The persistence tier stores collection and needs-attention records. `storageAdapter` selects:

- `nedb` (default): local `collection.db` and `needs-attention.db` files
- `rds` (optional/legacy): MySQL tables configured through `secure.config.cjs`

Collection persistence is off by default. A scan writes only when both `queryingEnabled` and
`collectionEnabled` are true. Scanning the same unambiguous card again increments its quantity;
explicit collection commands can correct or remove an entry. “Unambiguous” means exactly one card
name and exactly one printing set. Multiple possible sets are written to needs-attention rather
than selecting the first set as confirmed collection data.

The processor owns one bounded OCR work directory per scan and removes it in a `finally` path on
success and failure. Set-symbol hashing follows the same ownership rule for its local and remote
temporary directories. Cleanup is awaited, logged on failure, and never replaces the primary scan
error.

See [Configuration and local data](configuration.md) for precedence, paths, and settings.

## Module map

| Path                    | Responsibility                                                    |
| ----------------------- | ----------------------------------------------------------------- |
| `index.mjs`             | CLI parsing, presentation, workflow invocation, and exit behavior |
| `src/config/`           | Configuration discovery, precedence, validation, and writes       |
| `src/image-processing/` | Input validation, cropping, and OCR preprocessing                 |
| `src/image-analysis/`   | Tesseract execution and OCR result selection                      |
| `src/fuzzy-matching/`   | Name and type normalization and fuzzy ranking                     |
| `src/matcher/`          | Candidate-print matching and hash orchestration                   |
| `src/image-hashing/`    | Perceptual image hashing and comparison                           |
| `src/export-processor/` | Card-hash comparison against the local cache and remote Scryfall  |
| `src/processor/`        | End-to-end scan workflow and decision orchestration               |
| `src/models/`           | Collection and needs-attention record validation and persistence  |
| `src/scryfall-api/`     | Scryfall requests and response translation                        |
| `src/storage/`          | Persistence contract and backend selection                        |
| `src/db-local/`         | NeDB name index, cache, operations log, and local persistence     |
| `src/rds/`              | Optional legacy MySQL persistence adapter                         |
| `src/diagnostics/`      | Sanitized environment and recent-activity reports                 |
| `src/regression/`       | Offline OCR, matching, and print-selection benchmark framework    |
| `src/logger/`           | Shared pretty/plain leveled logger                                |

## Tests and external services

Unit tests stub OCR, Scryfall, filesystem, and database boundaries where needed and require neither
live network access nor MySQL. The regression suite uses committed images and an offline print
catalog so OCR and matching quality can be compared repeatably. See
[Regression testing](regression-testing.md) for its fixture and reporting contracts.
