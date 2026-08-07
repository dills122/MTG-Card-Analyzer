# AI Central Integration

This repository uses the sibling `ai-central` checkout for reusable AI steering, skills, and custom
agents. The integration follows the hybrid Wap Labs, Reef, and Capsule Corp pattern.

## Ownership Model

Real, tracked, repository-specific files:

- `AGENTS.md`
- `CLAUDE.md`
- `.codex/AI_CENTRAL.md`
- `.codex/ai-central-pin.json`
- `.codex/steering/repository-steering.md`
- `.codex/steering/testing-quality-gates-steering.md`
- `scripts/setup-ai-context.mjs` and its tests

Local, ignored symlinks:

- `.codex/steering/javascript-typescript-steering.md`
- `.codex/skills/*`
- `.claude/skills`
- `.agents/skills`
- `.claude/agents/*`

Root `AGENTS.md` and the project-owned steering files are authoritative. Shared content must not
change project scope, weaken input/resource boundaries, require hosted infrastructure for local
tests, or override the verification gates.

## Installed Selection

- Profiles: `base`, `javascript-typescript`
- Skill bundles: `core`, `brevity`, `engineering`, `planning`, `workflow`
- Additional Caveman skill: `cavecrew`
- Custom agents: `cavecrew-investigator`, `cavecrew-builder`, `cavecrew-reviewer`, `code-reviewer`,
  `security-auditor`, and `test-engineer`

The selected skills cover planning, TDD, debugging, review, security, performance, API/storage
design, documentation, delivery, and token-efficient Caveman workflows. Framework-specific Vue,
React, Rust, JVM, Terraform, and product/marketing bundles are intentionally not selected.

## Refresh And Validation

AI Central defaults to `../ai-central`. Override it with `AI_CENTRAL_HOME`, pointing to either the
repository root or its `templates` directory.

```sh
# Preview link changes
pnpm ai:setup -- --dry-run

# Create or repair links
pnpm ai:setup

# Validate the pinned revision, required files, and managed links
pnpm ai:check
```

The setup command preserves real repo-owned files. It invokes AI Central's non-overwriting setup for
profiles and bundles, then repairs this repository's managed Claude/Agents aliases and custom-agent
links.

## Provenance Pin

`.codex/ai-central-pin.json` records the reviewed AI Central commit. Setup and validation refuse to
continue when the checkout has drifted or contains tracked uncommitted changes. After reviewing an
intentional AI Central update:

```sh
pnpm ai:setup -- --record-pin
pnpm ai:setup
pnpm ai:check
```

The pin and clean-worktree check detect local checkout drift; they do not independently vet upstream
content. Third-party source attribution and licenses remain in AI Central because shared content is
linked rather than copied.

## Portability

The symlinks are deliberately ignored and are not present in a fresh clone. Repository instructions
remain usable without AI Central, but shared skills and custom agents require a local AI Central
checkout followed by `pnpm ai:setup`.
