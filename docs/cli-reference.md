# CLI reference

The package installs the `mtg-card-analyzer` executable. Use `mtg-card-analyzer --help` or
`mtg-card-analyzer <command> --help` after installing the package. From a source checkout, run the
same commands with `node index.mjs`; for example, `node index.mjs --help`.

## Commands at a glance

| Command             | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `scan <filePath>`   | Identify a card image and optionally persist the result   |
| `names seed`        | Seed the required local card-name index from Scryfall     |
| `log dump`          | Print recent local operations-log entries                 |
| `log stats`         | Summarize the local operations log                        |
| `collection update` | Set an existing collection entry's quantity               |
| `collection remove` | Permanently delete a collection entry                     |
| `migrate`           | Copy local NeDB collection data to the legacy RDS backend |
| `diagnostics`       | Print an environment and recent-activity support bundle   |
| `config list`       | Show all resolved settings and their sources              |
| `config get`        | Print one resolved setting                                |
| `config set`        | Validate and persist one setting                          |

## Scan a card

Before the first scan, seed the local name index. The command needs network access. It is safe to
repeat: the seeder rejects unmatchable catalog entries, repairs invalid or duplicate rows, and
upserts names idempotently.

```bash
mtg-card-analyzer names seed
```

```bash
mtg-card-analyzer scan ./path/to/card.jpg
```

A bare image path is accepted as a backward-compatible shorthand:

```bash
mtg-card-analyzer ./path/to/card.jpg
```

Scan inputs are limited to JPEG, PNG, GIF, and BMP files. Local files may be at most 32 MiB,
12,000 pixels on either axis, and 40 megapixels decoded. Signature and dimension validation runs
before image decoding, so renaming an unsupported file to a supported extension does not bypass
the check.

### Scan options

| Option                          | Effect                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `-q, --query`                   | Allow persistence writes for this run; collection tracking must also be enabled           |
| `--no-query`                    | Force a run without collection writes even if configuration enables them                  |
| `--enable-collection`           | Enable collection and needs-attention tracking for this run                               |
| `-p, --pretty`                  | Force human-readable logging for this run                                                 |
| `--no-pretty`                   | Force plain logging for this run                                                          |
| `--storage-adapter <nedb\|rds>` | Select the collection persistence backend                                                 |
| `--card-names-db <path>`        | Override the local card-name database directory or `.db` file                             |
| `--card-hash-db <path>`         | Override the local image-hash database directory or `.db` file                            |
| `--no-local-cache`              | Disable image-hash caching and the operations log; the required name index remains active |
| `--debug`                       | Store fuller matching details in the operations log for this scan                         |
| `--config <path>`               | Read settings from a specific JSON configuration file                                     |

`--query` and `--enable-collection` are intentionally separate. A scan writes collection or
needs-attention records only when both resolve to `true`. Without both, the full identification
pipeline still runs and prints its results.

Confirmed collection data requires exactly one matched card name and one image-verified exact
printing. A lone Scryfall search result is only an unverified candidate. If multiple variants share a
set, the match only verifies a set symbol, or any candidate otherwise remains unverified, the scan
writes a needs-attention record containing set-code and collector-number labels (when both persistence
opt-ins are enabled). Dry runs and scans with
collection tracking disabled continue to print the candidates without persistence writes.

Pretty logging is enabled by default. It keeps pipeline detail visible with compact, aligned level
labels, emits one OCR progress heartbeat per crop, and prints final card, set, and exact-print
candidate summaries without internal URLs or comparison objects:

```text
INFO  Reading card name
INFO  OCR name-core: 50%
INFO  OCR name-core: 87% confidence; "Pacifism" -> "PACIFISM"
INFO  Name candidates (1): 1. Pacifism (100%)

Scan results

1. Pacifism
   Sets: Core Set 2020
   Printings: M20 #32 (verified)
```

Interactive terminals receive colored level labels; redirected output remains color-free. Use
`--no-pretty` when another tool needs unadorned log messages. Full comparison metrics and Scryfall
links stay available through the local operations log and `--debug` instead of being dumped into
routine scan output.

## Inspect scan activity

Every scan records an operations-log entry while the local cache is enabled. Entries include the
input path, OCR text, match candidates, decision, duration, and any error. The CLI awaits this log
write and any image-hash cache writes before exiting. Cache failures are reported but do not replace
the primary scan result.

```bash
mtg-card-analyzer log dump
mtg-card-analyzer log dump --limit 20
mtg-card-analyzer log dump --format json --since 2026-01-01
mtg-card-analyzer log stats
```

`log dump` options:

- `--limit <n>`: maximum entries, default `50`
- `--since <ISO date>`: include entries at or after the date
- `--format <table|json>`: output format, default `table`
- `--config <path>`: use a specific configuration file

`log stats` accepts `--config <path>`.

## Generate diagnostics

```bash
mtg-card-analyzer diagnostics
mtg-card-analyzer diagnostics --limit 50
mtg-card-analyzer diagnostics --with-mysql
```

Diagnostics prints JSON containing application, Node.js, and platform versions; environment
checks; active configuration; and recent operations. It includes local config/database paths,
source-image paths, OCR text, and scan details, so review the output before sharing it. The bundle
never includes MySQL credentials. With `--with-mysql`, the connection layer reads them only to
perform the requested connection check. Card-name diagnostics report total, valid, unique,
invalid, and duplicate row counts. An empty, entirely invalid, or implausibly small name index is a
required failure and makes the command exit nonzero; repairable invalid/duplicate rows in an
otherwise usable index are warnings. MySQL connection failures remain optional warnings.

Options:

- `--limit <n>`: operations-log entries to include, default `20`
- `--with-mysql`: also test the configured MySQL connection
- `--config <path>`: use a specific configuration file

## Manage configuration

```bash
mtg-card-analyzer config list
mtg-card-analyzer config get storageAdapter
mtg-card-analyzer config set queryingEnabled true
mtg-card-analyzer config set collectionEnabled true --config ./another-config.json
```

- `config list` shows every runtime setting and whether its value came from the environment, the
  selected file, or a built-in default. `--config` selects the file; it does not make the values in
  that file CLI-sourced.
- `config get <key>` prints one resolved value.
- `config set <key> <value>` validates and merges one setting into the active JSON file.

All three accept `--config <path>`. See [Configuration and local data](configuration.md) for keys,
precedence, file discovery, and database paths.

## Correct collection entries

Scanning the same unambiguous card again adds one to its quantity. These commands make explicit
corrections through the active persistence backend:

```bash
mtg-card-analyzer collection update "Pacifism" M20 --quantity 3
mtg-card-analyzer collection remove "Pacifism" M20
```

`collection update` overwrites the quantity with the supplied non-negative value and rescales the
estimated value from the existing per-card value. The entry must already exist.

`collection remove` permanently deletes the named entry without a confirmation prompt. It exits
non-zero if the entry does not exist.

Both commands accept `--storage-adapter <nedb|rds>` and `--config <path>`.

## Migrate local data to MySQL/RDS

The only supported migration is from local NeDB collection and needs-attention data to RDS:

```bash
mtg-card-analyzer migrate --to rds --dry-run
mtg-card-analyzer migrate --to rds
```

The command always reads from local NeDB regardless of the active storage adapter. By default it
skips collection entries already found on the target. `--force` adds the local quantity again;
needs-attention entries remain subject to the target's unique constraint.

Options:

- `--to <rds>`: required target backend
- `--dry-run`: preview without writing
- `--force`: re-migrate collection entries found on the target
- `--card-names-db <path>`: select the local NeDB source path
- `--config <path>`: use a specific configuration file

Set up the optional backend first with
[`node scripts/setup.mjs --with-mysql`](LOCAL_DEV.md#mysql--docker).
