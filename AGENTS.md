# AGENTS

Repository-wide AI coding guidance for MTG Card Analyzer.

## Purpose

MTG Card Analyzer is a local-first Node.js CLI that identifies Magic: The Gathering cards from
images using OCR, fuzzy name matching, and image-hash print matching.

Optimize for:

- reliable card identification across clean scans and degraded photos
- deterministic, offline-first tests and regression fixtures
- bounded image, OCR, network, and storage work with explicit cleanup
- stable CLI, configuration, and storage contracts
- small, explicit changes over broad refactors
- tests and documentation when behavior, contracts, setup, or commands change

## Start Here

Before changing behavior, read:

- `Readme.md` for supported workflows and current architecture
- `CONTRIBUTING.md` for contribution and quality expectations
- `docs/regression-testing.md` for benchmark fixtures and regression policy
- `.codex/steering/repository-steering.md` for ownership boundaries
- `.codex/steering/testing-quality-gates-steering.md` for verification requirements
- `.codex/steering/javascript-typescript-steering.md` for shared JS/TS guidance

The root instructions and project-owned steering files take precedence over linked AI Central
content when they conflict.

## Architecture Boundaries

Primary areas:

- `index.mjs`: thin CLI boundary; parse options, resolve configuration, invoke workflows, report
  results, and set exit behavior
- `src/config/`: configuration resolution and precedence
- `src/image-analysis/` and `src/image-processing/`: OCR extraction and bounded image transforms
- `src/fuzzy-matching/`, `src/matcher/`, and `src/processor/`: matching and orchestration logic
- `src/scryfall-api/`: external Scryfall boundary
- `src/storage/` and `src/db-local/`: storage abstraction and local NeDB persistence
- `src/rds/`: optional legacy MySQL/RDS adapter; do not make it a default dependency
- `test/` and `test-images/`: deterministic behavior tests and committed image fixtures

Keep pure matching decisions separate from image, network, filesystem, and database adapters. When
a change spans boundaries, update the shared contract first and keep entrypoints thin.

## Contract-First Files

Treat these as interfaces before implementation details:

- `package.json` scripts, engines, package-manager declaration, and CLI entrypoint
- `mtg.config.example.json` and configuration precedence documented in `Readme.md`
- `src/config/index.mjs`
- `src/storage/create-storage.mjs` and `src/storage/adapters/`
- `test/regression/fixtures/manifest.json`
- public CLI commands, flags, output shape, and exit codes in `index.mjs`

If behavior changes, update the relevant tests, examples, and documentation in the same change.

## Scope And Safety

- Treat image paths, config files, environment variables, CLI input, OCR output, API responses, and
  stored records as untrusted data.
- Constrain file access and temporary artifacts; clean up snippets on success and failure.
- Bound image dimensions, buffers, OCR work, network requests, retries, and concurrent operations.
- Never commit credentials, local databases, generated OCR snippets, coverage, or benchmark output.
- Keep `secure.config.cjs` local-only. Maintain `secure.config.template.cjs` as the documented shape.
- Do not require MySQL/RDS for the default local workflow or unit test suite.
- Do not refresh or relabel committed regression expectations merely to make a regression pass.
- Avoid unrelated dependency, formatting, fixture, or generated-artifact churn.

## JavaScript And TypeScript

The linked shared JS/TS steering uses template placeholders. Resolve them for this repository as:

- `JAVASCRIPT_TYPESCRIPT_ROOT`: `.` with primary runtime code under `index.mjs`, `src/`, and
  `scripts/`
- format: `pnpm prettier:check`
- lint: `pnpm lint`
- typecheck/build: `pnpm typecheck` (the project emits no build artifact)
- tests: `pnpm test`
- dependency audit: `pnpm audit`

Repository reality wins where generic guidance assumes a TypeScript-only codebase: this project is
ESM JavaScript with incremental TypeScript checking through `allowJs` and `checkJs`.

## Testing And Fixtures

- Add focused Mocha tests for behavior and failure-path changes.
- Mock network and database boundaries in unit tests; default tests must remain offline.
- For OCR or matching quality changes, run `pnpm test:regression` and inspect both benchmark outputs.
- Keep regression fixtures explicit and deterministic. New fixtures remain disabled until labels and
  offline print references are reviewed.
- Use temporary directories for filesystem tests and clean them up reliably.

## Useful Commands

- Install dependencies: `pnpm install --frozen-lockfile`
- Fast quality gate: `pnpm check:fast`
- Unit tests: `pnpm test`
- OCR regression gate: `pnpm test:regression`
- Full local gate: `pnpm check`
- Coverage: `pnpm coverage:check`
- Refresh local AI links: `pnpm ai:setup`
- Validate AI integration: `pnpm ai:check`

## AI Central Integration

Repository-specific files are real and tracked. Reusable steering, skills, and custom agents are
local symlinks recreated from the sibling `ai-central` checkout. See `.codex/AI_CENTRAL.md` for the
selection, provenance pin, refresh workflow, and portability notes.

## Branch And PR Metadata

- Use feature branches for behavior, contract, test, or documentation changes.
- Do not commit directly to `master`.
- When work is ready, provide a branch name, concise commit message, PR title and summary, and exact
  verification evidence.
