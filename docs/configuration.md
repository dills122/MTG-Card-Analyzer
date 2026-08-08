# Configuration and local data

MTG Card Analyzer works with its built-in defaults after `node scripts/setup.mjs`. Use a JSON
configuration file for settings you want on every run and CLI flags for temporary overrides.

## Precedence

Settings resolve in this order, from highest to lowest priority:

1. CLI flags
2. Environment variables
3. JSON configuration file
4. Built-in defaults

The configuration file is selected in this order:

1. `--config <path>`
2. `MTG_CONFIG_PATH`
3. `./mtg.config.json` in the current working directory
4. `~/.mtg-card-analyzer/config.json`, if it already exists

`mtg.config.json` is machine-specific and ignored by Git. The setup script creates it from
[`mtg.config.example.json`](../mtg.config.example.json) without overwriting an existing file.

## Settings

| JSON key            | Environment variable  | Default               | Scan-time CLI override     |
| ------------------- | --------------------- | --------------------- | -------------------------- |
| `storageAdapter`    | `STORAGE_ADAPTER`     | `nedb`                | `--storage-adapter <name>` |
| `cardNamesDbPath`   | `CARD_NAMES_DB_PATH`  | platform app-data dir | `--card-names-db <path>`   |
| `cardHashDbPath`    | `CARD_HASH_DB_PATH`   | card-name DB location | `--card-hash-db <path>`    |
| `localCacheEnabled` | `LOCAL_CACHE_ENABLED` | `true`                | `--no-local-cache`         |
| `collectionEnabled` | `COLLECTION_ENABLED`  | `false`               | `--enable-collection`      |
| `queryingEnabled`   | `QUERYING_ENABLED`    | `false`               | `--query` / `--no-query`   |
| `prettyLogging`     | `PRETTY_LOGGING`      | `true`                | `--pretty` / `--no-pretty` |
| `debugLogging`      | `DEBUG_LOGGING`       | `false`               | `--debug`                  |

Accepted `storageAdapter` values are `nedb` and `rds`. Boolean values written through `config set`
must be exactly `true` or `false`.

Example:

```json
{
    "storageAdapter": "nedb",
    "cardNamesDbPath": "",
    "cardHashDbPath": "",
    "localCacheEnabled": true,
    "collectionEnabled": false,
    "queryingEnabled": false,
    "prettyLogging": true,
    "debugLogging": false
}
```

## Change settings through the CLI

```bash
node index.mjs config list
node index.mjs config get queryingEnabled
node index.mjs config set queryingEnabled true
```

`config list` is useful when a value is surprising because it reports the winning source for every
setting. `config set` preserves other keys and creates `./mtg.config.json` when no configuration
file is active.

Settable keys are `storageAdapter`, `cardNamesDbPath`, `cardHashDbPath`, `localCacheEnabled`,
`collectionEnabled`, `queryingEnabled`, `prettyLogging`, and `debugLogging`.

## Collection writes are opt-in

Two settings must be enabled before a scan changes collection or needs-attention data:

- `queryingEnabled` allows persistence for the scan.
- `collectionEnabled` turns on the collection-tracking module.

This makes both the intent to write and the intent to maintain an inventory explicit. You can save
the settings:

```bash
node index.mjs config set collectionEnabled true
node index.mjs config set queryingEnabled true
```

Or override them for one scan:

```bash
node index.mjs scan ./card.jpg --enable-collection --query
```

Explicit `collection update`, `collection remove`, and `migrate` commands do not require
`collectionEnabled`; invoking those commands is the opt-in for that operation.

## Local files

With empty path settings, NeDB files are created in the first writable platform application-data
location. The usual locations are `%APPDATA%` on Windows, `~/Library/Preferences` on macOS, and
`~/.local/share` on Linux. The resolver then falls back to `~/.mtg-card-analyzer` and finally the
system temporary directory.

| File                 | Role                             | Tier        |
| -------------------- | -------------------------------- | ----------- |
| `cardNames.db`       | Required local card-name index   | Name index  |
| `card-hashes.db`     | Reusable image hashes            | Cache       |
| `operations.db`      | Scan history and diagnostics     | Cache       |
| `collection.db`      | Confirmed collection entries     | Persistence |
| `needs-attention.db` | Ambiguous matches needing review | Persistence |

`CARD_NAMES_DB_PATH` and `CARD_HASH_DB_PATH` may point to a directory or to a complete `.db` file.
When given a directory, the application appends the appropriate default filename. The operations,
collection, and needs-attention files follow the card-name database location. The hash database
uses `CARD_HASH_DB_PATH`, then falls back to `CARD_NAMES_DB_PATH`.

A complete `.db` path is used as-is by every store that inherits that setting. Prefer a directory
when you want the standard stores to use separate files, and set `cardHashDbPath` explicitly when
the hash cache should live somewhere else.

Disabling the local cache turns off the image-hash cache and operations log. It does not disable
the card-name index, which is required for matching and has no remote fallback.

See [Architecture](architecture.md#storage-boundaries) for the difference between cache and
persistence data.

## Optional MySQL/RDS credentials

MySQL credentials are not part of the JSON configuration. The legacy `rds` adapter reads
`secure.config.cjs`, which is local-only and ignored by Git. Use
[`secure.config.template.cjs`](../secure.config.template.cjs) for its shape or let
`node scripts/setup.mjs --with-mysql` create a configuration matching the local Docker defaults.

See [MySQL / Docker setup](LOCAL_DEV.md#mysql--docker) before selecting `rds`.
