# Architecture

MTG Card Analyzer keeps command parsing, matching decisions, network access, and persistence in
separate modules. The default runtime is a local-first Node.js CLI with Scryfall-backed print
matching and an optional legacy MySQL backend.

## Scan pipeline

1. `index.mjs` parses the command and resolves configuration.
2. `src/image-processing/` reads the local file once into a capped buffer, allowlists its magic
   signature, validates dimensions and decoded pixels, and only then passes those same bytes to
   Jimp. A bounded edge-analysis image refines expected title windows around detected text while
   preserving padding; ambiguous analysis falls back to the original percentage window.
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

Set-symbol extraction searches a bounded area around the expected type-line position. Local color
contrast finds compact symbol-like components, long frame rules are suppressed, and the selected
icon is centered in a square crop with padding. If no credible component is found, set-symbol
hashing is marked low-confidence so matching can use the existing full-card fallback.
When every Scryfall candidate uses a structurally nonstandard `flip`, `meld`, `planar`, `saga`, or
`split` layout, matching skips the conventional set-symbol crop and starts with the full-card hash.
Mixed or unknown candidate layouts remain set-symbol-first so metadata cannot broadly reroute normal
printings or visual treatments such as full-art, borderless, and showcase cards.

Local image input is capped at 32 MiB, 12,000 pixels per axis, and 40 megapixels. JPEG decoding also
uses a 256 MiB decoder allocation ceiling. Remote set-symbol images are limited to the approved
Scryfall image origins, HTTPS, three same-origin redirects, a 15-second request deadline, and a
16 MiB streamed body. Redirects are handled manually so request headers are never forwarded to a
different origin. Accepted decoded formats are JPEG, PNG, GIF, and BMP; generic multi-format
metadata probing and TIFF decoding are intentionally outside the scan boundary.

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
name and one image-verified exact printing. Exact print IDs, set codes, and collector numbers remain
distinct through matching even when variants share a set name. A lone Scryfall result, a closest-image
best guess, a set-symbol-only match, or multiple possible printings is written to needs-attention
rather than confirmed.

The hash cache keys refreshed rows by Scryfall print ID (falling back to set code, collector number,
and language) plus hash mode and hash. Legacy set-only rows remain usable as unverified hints; they
cannot confirm an exact printing. Set-symbol hash modes include a crop-algorithm version, so a crop
geometry change skips incompatible cached fingerprints and refreshes them through the remote path.

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
