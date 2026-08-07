# Testing And Quality Gates

Testing must protect CLI contracts, configuration precedence, matching behavior, cleanup, storage
boundaries, and OCR regression quality.

## Default Expectations

- Add or update focused Mocha tests for behavior changes and fixed defects.
- Cover invalid and boundary input, rejected promises, cleanup, and adapter failures.
- Keep unit tests offline and deterministic; stub Scryfall, OCR, filesystem, and database boundaries.
- Use temporary directories for persistence tests and remove them in teardown.
- Treat committed image fixtures and regression expectations as reviewed evidence, not snapshots to
  rewrite automatically.
- Run the image regression gate for OCR preprocessing, hashing, normalization, fuzzy matching, or
  print-selection changes.

## Required Commands

Run the smallest relevant checks first, then the full applicable gate:

- Formatting: `pnpm prettier:check`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Unit tests: `pnpm test`
- OCR regression: `pnpm test:regression`
- Full standard gate: `pnpm check`
- Coverage gate when test coverage changes: `pnpm coverage:check`
- AI integration changes: `pnpm ai:check` and `pnpm test -- --grep "AI Central"`

## Quality Gates

- No new lint, typecheck, unit-test, or formatting failures.
- No live network or MySQL dependency in default unit tests.
- No leaked handles, temporary files, or mutable shared fixture state.
- No unrelated formatting, lockfile, database, image, coverage, or benchmark churn.
- Public CLI/config/storage contracts and docs updated with behavior changes.
- Regression misses are investigated and reported; expected results are not weakened to force green.

If a command cannot run locally, report the exact blocker and remaining risk.
