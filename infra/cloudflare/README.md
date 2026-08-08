# Cloudflare OpenTofu infrastructure

This flat OpenTofu root owns the durable Cloudflare resources used by the test-data portal:

- the D1 review-queue database;
- the private R2 submission-image bucket.

Wrangler continues to own Worker code and static-asset deployment, D1 migrations, runtime
bindings, and Worker secrets. Turnstile is intentionally not managed here because the provider
returns its secret into OpenTofu state.

## Toolchain and state

- OpenTofu: exactly `1.12.5` (see `.opentofu-version`)
- Cloudflare provider: exactly `5.22.0`
- backend: a separate private R2 bucket through the S3-compatible backend with native lock files
- state and saved plans: client-side AES-GCM encryption with a protected passphrase

The state bucket is a bootstrap prerequisite and must not be the submission-image bucket. Create it
once through a separately authorized operator action, establish a verified encrypted backup and
recovery procedure, and restrict its R2 credentials to that bucket. Never commit the credentials,
backend configuration, passphrase, state, or plans.

## Credential-free validation

```sh
pnpm infra:fmt:check
pnpm infra:init
pnpm infra:validate
```

`infra:init` disables the backend and uses the committed provider lock file. These commands validate
configuration only; they do not prove that hosted resources exist.

## Protected plan and apply

Copy the examples into ignored runtime files and export credentials from the project secret store:

```sh
cd infra/cloudflare
cp terraform.tfvars.example terraform.tfvars
cp backend.hcl.example backend.hcl

export CLOUDFLARE_API_TOKEN="..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export TF_VAR_state_encryption_passphrase="..."

tofu init -backend-config=backend.hcl -lockfile=readonly
mkdir -p .plans
tofu plan -out=.plans/portal.tfplan
tofu apply .plans/portal.tfplan
```

Review the exact saved plan before applying it. The Cloudflare token needs D1 Write and Workers R2
Storage Write for the selected account. The R2 backend credentials are separate and scoped only to
the state bucket.

After apply, copy `tofu output -raw d1_database_id` into the `SUBMISSIONS_DB` binding in
`site/wrangler.jsonc`. Confirm the R2 output matches the `SUBMISSION_IMAGES` binding, run the remote
D1 migration, configure Turnstile through Wrangler, and deploy the Worker as documented in
`docs/test-data-portal.md`.

## Recovery and teardown

Both application resources have `prevent_destroy`. A deliberate teardown requires a reviewed code
change removing that guard, an export/backup decision for D1 and R2, and explicit authorization for
the destructive apply. For state recovery, restore a verified encrypted object version from the
state bucket and use the same encryption passphrase. Losing the passphrase makes encrypted state
unrecoverable.
