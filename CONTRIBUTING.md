# Contributing

Thanks for looking at MTG Card Analyzer. This doc covers how to set up, work on, and submit changes. See [Readme.md](Readme.md) for what the project does and how to run it.

## Setup

- Node >= 20 (repo is developed/tested on Node 22)
- [pnpm](https://pnpm.io/) >= 8: `corepack enable` or `npm i -g pnpm`
- Clone and run the setup script:

```bash
git clone https://github.com/dills122/MTG-Card-Analyzer.git
cd MTG-Card-Analyzer
node scripts/setup.mjs
```

That installs deps (also runs `lefthook install` via the `prepare` script, wiring up git hooks for lint-staged), creates local config files, and seeds the card names dictionary. Full walkthrough, flags, and troubleshooting: **[docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)**.

## AI-Assisted Development

Repository-specific guidance is tracked in `AGENTS.md` and `CLAUDE.md`. Optional shared steering,
skills, and custom agents come from a sibling `ai-central` checkout and remain ignored local
symlinks:

```bash
pnpm ai:setup
pnpm ai:check
```

See `.codex/AI_CENTRAL.md` for the selected bundles, pinned revision, custom-agent list, and refresh
workflow. A normal build does not require AI Central.

## Branching & Commits

- Branch off `master`. Use a short descriptive branch name (e.g. `fix/image-too-small-error`, `feat/multi-image-scan`).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`). Keep the subject line under ~50 chars; add a body when the "why" isn't obvious from the diff alone.

## Before Opening a PR

Run the full local gate — it's close to what CI checks:

```bash
pnpm check
```

That's `lint` + `prettier:check` + `typecheck` + `test`. Individual pieces (`pnpm lint:fix`, `pnpm format`) can autofix most issues.

Type checking is being introduced incrementally for this ESM JavaScript codebase. The strict
checked-module list lives in `tsconfig.checked.json`; add a touched production module there once its
JSDoc contracts pass `pnpm typecheck`.

For anything touching logic, also run coverage and take a look at what's newly uncovered:

```bash
pnpm coverage
```

CI enforces a coverage floor (`pnpm coverage:check`, thresholds in the `c8` block of `package.json` —
currently 85% lines/statements/functions, 70% branches) so coverage can't silently regress. Run
`pnpm coverage:check` locally before pushing if your change touches lightly-covered code.

## Tests

- Tests live in `test/**/*.spec.mjs` and mirror the `src/` structure.
- Tests stub external calls (Scryfall API, MySQL/RDS, filesystem where practical) — no live network or DB access required to run the suite.
- Prefer constructor, factory, or function-parameter injection at I/O boundaries. Use standalone
  `sinon` fakes in each test; do not mutate module-level dependency objects shared by production
  imports.

## Project Layout

Quick orientation — see individual `index.mjs` files in each folder for the public surface of that module:

- `src/image-processing/`, `src/image-analysis/` — image prep + OCR
- `src/fuzzy-matching/`, `src/matcher/` — name/type matching + decision logic
- `src/scryfall-api/` — Scryfall HTTP client
- `src/db-local/` — required name index, default-on nedb cache (hashes, ops log), and local persistence backend (collection, needs-attention)
- `src/storage/` — the two-tier abstraction over the above; see [Architecture](docs/architecture.md#storage-boundaries)
- `src/rds/` — legacy/optional MySQL persistence backend, not used by default
- `src/processor/` — orchestrates the end-to-end scan pipeline
- `src/config/` — single source of truth for runtime settings (CLI flag > env var > config file > default)
- `index.mjs` — CLI entry point (`scan`, `log dump`, `log stats`)
- `scripts/` — dev tooling: `setup.mjs` (ramp-up), `verify-env.mjs` (environment sanity check)
- `docker-compose.yml` — local MySQL for the optional `rds` adapter
- `docs/` — deeper guides (currently: local dev setup)

## Picking Up an Issue

Open issues are the source of truth for planned work. If an issue looks stale, out of date, or you're not sure it still applies, comment on it (or open a new one) before starting — don't assume.

## Reporting Bugs

Include: Node version, OS, the exact command run, and full error output. For OCR/matching issues, attach (or point at) the input image if possible — behavior is very image-dependent.
