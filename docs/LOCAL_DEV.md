# Local Dev Setup

Everything you need to get MTG Card Analyzer running locally, from a clean clone to a working
scan. For contribution workflow (branching, PR gate, commit conventions), see
[CONTRIBUTING.md](../CONTRIBUTING.md). For commands and flags, see the
[CLI reference](cli-reference.md); for system boundaries, see [Architecture](architecture.md).

## Quick start

```bash
git clone https://github.com/dills122/MTG-Card-Analyzer.git
cd MTG-Card-Analyzer
node scripts/setup.mjs
node index.mjs scan ./test-images/PlatinumAngel.jpg
```

That's the nedb-only path (default, no MySQL needed) — installs deps, creates local config files, seeds the card names dictionary. If it worked, you'll see match output for Platinum Angel.

Want the MySQL persistence adapter too? Use `--with-mysql` instead (needs [Docker](https://docs.docker.com/get-docker/) running):

```bash
node scripts/setup.mjs --with-mysql
node index.mjs scan ./test-images/PlatinumAngel.jpg --query --enable-collection --storage-adapter rds
```

Not sure if your environment is actually working? Run the verifier any time:

```bash
node scripts/verify-env.mjs              # nedb-only checks
node scripts/verify-env.mjs --with-mysql # also checks the MySQL connection
```

## What `scripts/setup.mjs` does

The setup script itself is deliberately dependency-free (only core Node modules), so it can run
before `pnpm install` has succeeded on a fresh clone. Configuration creation is non-clobbering, but
installation and seeding repeat unless skipped. Seeding is idempotent, so rerunning setup updates
the existing index without duplicating it. Use `--skip-seed` only when
`node scripts/verify-env.mjs` already reports a healthy card-name index.

| Step               | What happens                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Node version check | Warns if `<20`                                                                                          |
| pnpm check         | Warns with the fix if pnpm isn't installed                                                              |
| `pnpm install`     | Skip with `--skip-install`                                                                              |
| Local config files | Creates `secure.config.cjs` and `mtg.config.json` if missing (leaves existing ones alone)               |
| Seed card names    | Runs `node ./src/db-local/bulk-insert.mjs` (needs network access to Scryfall) — skip with `--skip-seed` |
| MySQL (opt-in)     | With `--with-mysql`: starts `docker compose`, waits for the healthcheck, runs `pnpm setup-db`           |

Flags compose: `node scripts/setup.mjs --with-mysql --skip-seed` skips seeding but still sets up MySQL.

Name seeding prints one start summary and one completion summary. It validates names with the same
normalization used by matching, skips upstream names that cannot produce a match key, deduplicates
the catalog, repairs existing invalid/duplicate rows, and upserts with bounded concurrency. An
empty or entirely unmatchable catalog is a failure. Because scans require the local name index,
setup exits nonzero when the required seed fails.

With `--with-mysql`, the generated `secure.config.cjs` matches `docker-compose.yml`'s actual defaults (host/port/user/password/database) so `pnpm setup-db` works immediately — it does **not** just copy the generic template (which has placeholder values and would fail to connect).

## Persistence architecture (what you're setting up)

A required name index plus two storage tiers — see
[Architecture](architecture.md#storage-boundaries) for the full picture:

- **Name index** (required nedb): the card-name dictionary seeded by `scripts/setup.mjs`.
- **Cache tier** (default-on nedb): image hashes and the local operations log.
- **Persistence tier** (`nedb` default | `rds` opt-in): your actual collection + needs-attention
  records. `nedb` needs nothing extra. `rds` needs the MySQL setup above.

## MySQL / Docker

`docker-compose.yml` at the repo root runs a single `mysql:8` service, configured via `.env` (copy `.env.example` if you want to customize the port/password/db name — the defaults work fine as-is for local dev).

```bash
pnpm docker:up      # start MySQL (or: docker compose up -d)
pnpm docker:logs     # tail MySQL logs
pnpm setup-db        # create tables (needs secure.config.cjs)
pnpm docker:down     # stop MySQL (data persists in a named volume)
```

To wipe local MySQL state entirely: `docker compose down -v` (removes the volume too).

`pnpm setup-db --truncate` (or `-t`) also runs `destroy-tables.sql` after creating tables, if you want a clean slate on an existing DB.

## Running checks

```bash
pnpm check          # full gate: lint + prettier + typecheck + test
pnpm test            # tests only
pnpm coverage        # tests + coverage report (coverage/index.html)
pnpm coverage:check  # tests + the coverage thresholds enforced by CI
pnpm test:regression # cold-cache OCR and matching regression gate
node scripts/verify-env.mjs  # is the environment actually usable
```

`pnpm check` is the standard local gate. CI runs `pnpm check:fast`, `pnpm coverage:check`, and a
separate `pnpm test:regression` job; see [CONTRIBUTING.md](../CONTRIBUTING.md#before-opening-a-pr)
for the exact sequence.

## Troubleshooting

**`Error: No matches found` on a known card**
The local names DB is empty or pointing at the wrong path.

```bash
node ./src/db-local/bulk-insert.mjs
# or verify explicitly:
CARD_NAMES_DB_PATH=/absolute/path/to/db-or-dir node index.mjs scan ./test-images/QueenMarchesa.png
node scripts/verify-env.mjs
```

**`node scripts/setup.mjs` fails at the seed step**
The Scryfall request failed or returned no matchable catalog names. Setup exits nonzero because
scans cannot work without the name index. Restore network/catalog access and rerun setup, or run
`node ./src/db-local/bulk-insert.mjs` directly. Use `--skip-seed` only if diagnostics confirms an
already healthy index.

**`--with-mysql` fails at "Waiting for MySQL to become healthy"**
Docker isn't running, or the container crashed. Check `pnpm docker:logs`. `docker compose ps` shows container status.

**`pnpm setup-db` fails with a connection error**
`secure.config.cjs` doesn't match a running MySQL instance. If you ran `scripts/setup.mjs --with-mysql`, this should already be correct — check `docker compose ps` shows the container healthy, then re-run `pnpm setup-db`.

**Tesseract warnings during scan**
Noisy but non-fatal in the current runtime.
