# Contributing

Thanks for looking at MTG Card Analyzer. This doc covers how to set up, work on, and submit changes. See [README.md](README.md) for what the project does and how to run it.

## Setup

- Node >= 20 (repo is developed/tested on Node 22)
- [pnpm](https://pnpm.io/) >= 8: `corepack enable` or `npm i -g pnpm`
- Clone and install:

```bash
git clone https://github.com/dills122/MTG-Card-Analyzer.git
cd MTG-Card-Analyzer
pnpm install
```

`pnpm install` also runs `lefthook install` (via the `prepare` script), which wires up git hooks for lint-staged.

## Branching & Commits

- Branch off `master`. Use a short descriptive branch name (e.g. `fix/image-too-small-error`, `feat/multi-image-scan`).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`). Keep the subject line under ~50 chars; add a body when the "why" isn't obvious from the diff alone.

## Before Opening a PR

Run the full local gate — it's what CI checks:

```bash
pnpm check
```

That's `lint` + `prettier:check` + `typecheck` + `test`. Individual pieces (`pnpm lint:fix`, `pnpm format`) can autofix most issues.

For anything touching logic, also run coverage and take a look at what's newly uncovered:

```bash
pnpm coverage
```

No coverage threshold is enforced yet (see [#31](https://github.com/dills122/MTG-Card-Analyzer/issues/31)), but new code shouldn't make the picture worse.

## Tests

- Tests live in `test/**/*.spec.mjs` and mirror the `src/` structure.
- Tests stub external calls (Scryfall API, MySQL/RDS, filesystem where practical) — no live network or DB access required to run the suite.
- Use `proxyquire`/`sinon` (already deps) for stubbing module dependencies, consistent with existing specs.

## Project Layout

Quick orientation — see individual `index.mjs` files in each folder for the public surface of that module:

- `src/image-processing/`, `src/image-analysis/` — image prep + OCR
- `src/fuzzy-matching/`, `src/matcher/` — name/type matching + decision logic
- `src/scryfall-api/` — Scryfall HTTP client
- `src/db-local/`, `src/storage/` — local NeDB-backed cache + storage adapter abstraction
- `src/rds/` — legacy/optional MySQL adapter, not used by default
- `src/processor/` — orchestrates the end-to-end scan pipeline
- `index.mjs` — CLI entry point

## Picking Up an Issue

Open issues are the source of truth for planned work. If an issue looks stale, out of date, or you're not sure it still applies, comment on it (or open a new one) before starting — don't assume.

## Reporting Bugs

Include: Node version, OS, the exact command run, and full error output. For OCR/matching issues, attach (or point at) the input image if possible — behavior is very image-dependent.
