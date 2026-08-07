# Repository Scope And Priorities

MTG Card Analyzer is a local-first OCR and matching CLI for cataloguing Magic: The Gathering cards.

## Primary Deliverables

- extract candidate card names and types from supplied images
- resolve likely card names and printings with fuzzy and image-hash matching
- persist reusable local name and hash data without requiring a hosted service
- provide deterministic unit and image-regression evidence for matching quality

## Core Priorities

- correct, explainable matches before heuristic cleverness
- offline-first operation and tests
- bounded resource usage for images, OCR, network calls, and caches
- stable CLI, configuration, storage, and fixture contracts
- actionable errors without secret or local-path leakage

## Active Boundaries

- `index.mjs` owns CLI parsing and presentation, not matching or persistence rules.
- `src/config/` owns configuration precedence and validation.
- `src/image-analysis/` and `src/image-processing/` own OCR and image transformation.
- `src/fuzzy-matching/`, `src/matcher/`, and `src/processor/` own matching decisions and workflow.
- `src/scryfall-api/` owns remote Scryfall interaction and response translation.
- `src/storage/` owns the adapter contract; `src/db-local/` and `src/rds/` implement persistence.
- `test/regression/` owns benchmark labels, expectations, and reporting policy.

## Safe Refactor Boundaries

Do not change these without explicit intent and matching tests/docs:

- CLI command names, flags, output shape, or exit codes
- configuration precedence or environment-variable names
- local database locations, record semantics, or storage-adapter behavior
- normalization and fuzzy-match thresholds
- regression fixture labels or expected card/printing identities
- default local-first behavior or optional status of RDS

Safe defaults are focused validation, cleanup, diagnostics, typing, tests, and documentation within
one boundary. Update contracts first when a change must cross boundaries.

## Shared Steering Placeholder Resolution

For `.codex/steering/javascript-typescript-steering.md`, the project root is `.` and the canonical
commands are `pnpm prettier:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm audit`.
There is no separate production build step.
