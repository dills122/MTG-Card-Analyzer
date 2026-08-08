# Infrastructure And OpenTofu Steering

Repository-specific steering for `infra/cloudflare/`, its static-validation workflow, and the
portal deployment documentation. This file is adapted from AI Central's
`infrastructure-opentofu` profile at the revision pinned in `.codex/ai-central-pin.json`.

## Authority And Scope

Root `AGENTS.md` and repository-owned contracts take precedence. This file narrows the shared AI
Central guidance to the portal's D1 and R2 infrastructure; it does not authorize live Cloudflare
changes, credential creation, state mutation, apply, import, destroy, or force-unlock operations.

Keep application behavior and Wrangler deployment under `site/`. Keep durable Cloudflare resource
provisioning under `infra/cloudflare/`. Do not introduce a shared module until a second real
environment demonstrates the same lifecycle and interface.

## Toolchain And Locks

- Pin OpenTofu exactly to `1.12.5` and the Cloudflare provider exactly to `5.22.0`.
- Commit `.terraform.lock.hcl` with checksums for `linux_amd64`, `darwin_arm64`, and
  `darwin_amd64`.
- Review runtime/provider upgrades separately from infrastructure behavior changes.
- Keep ordinary validation credential-free and backend-disabled: formatting,
  `init -backend=false -lockfile=readonly`, validation, and provider-lock drift checks.

## State, Plans, And Secrets

- Use a separate private R2 bucket as the partial S3-compatible backend with native lock files.
- Inject bucket, key, endpoint, account, and R2 credentials only at runtime.
- Keep client-side state and plan encryption enforced. Store the passphrase outside the repository
  and outside the state it protects.
- Never commit `.terraform/`, state, saved plans, backend inputs, `.tfvars`, credentials, API
  tokens, or Turnstile secrets.
- Configure Cloudflare provider authentication through `CLOUDFLARE_API_TOKEN`; do not model it as
  an ordinary resource input.
- Keep Turnstile outside OpenTofu because its provider resource returns the widget secret into
  state. Configure the secret through Wrangler's secret store.
- Never print credentials, decrypted state, plaintext plans, or secret-bearing outputs in CI.

## Resource Safety

- D1 and the submission R2 bucket are stateful and must retain `prevent_destroy` unless a reviewed,
  explicitly authorized teardown includes backup and recovery decisions.
- Keep uploaded images private. Infrastructure must not add an R2 public development URL, custom
  domain, or permissive CORS policy without an explicit product and security decision.
- Treat resource IDs emitted by OpenTofu as non-secret deployment inputs; keep Wrangler binding
  names and resource names synchronized with those outputs.
- Bound public upload abuse in the application layer through size/type validation and Turnstile.
  Document any future WAF or rate-limit resource as a distinct cost and behavior decision.

## Plan, Apply, And Recovery

- Separate static validation, protected plan, and protected apply.
- Apply only an exact reviewed saved plan under a protected operator workflow.
- Serialize plan/apply work per state key and fail closed on lock contention.
- Back up or version the encrypted state before risky changes and verify the recovery path.
- Never run apply, destroy, import, state mutation, or force-unlock as part of ordinary CI.
- A successful local validation or speculative plan is not evidence that hosted resources exist.

## Review Evidence

Every infrastructure change must report:

- OpenTofu/provider versions and backend mode;
- expected resource actions and state/data risk;
- exact static validation commands and results;
- whether any live plan or apply ran;
- cost and public-exposure changes;
- rollback/recovery steps and remaining risk.
