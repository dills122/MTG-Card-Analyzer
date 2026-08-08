# Test data contribution portal

The contribution portal is a static project site and Cloudflare Worker under `site/`. It keeps
uploaded images private in R2 and records reviewable metadata in D1. A submission is always created
with `pending` status; the public API does not expose uploaded images or a listing endpoint.

## Architecture

- `site/public/`: dependency-free marketing site and uploader
- `site/worker/`: API routing, validation, Scryfall translation, Turnstile verification, and storage
- `site/migrations/`: D1 schema for the review queue
- R2 binding `SUBMISSION_IMAGES`: original image objects
- D1 binding `SUBMISSIONS_DB`: metadata and review state

The metadata mirrors the fields used by `test/regression/fixtures/manifest.json`: card name, set
code/name, collector number, type line, rarity, and image quality. Scryfall identifiers are
provenance helpers, not a substitute for maintainer review.

## Local development

Install dependencies, initialize the local D1 database, then start Wrangler:

```bash
pnpm install --frozen-lockfile
pnpm site:db:migrate:local
pnpm site:dev
```

Wrangler keeps local D1 and R2 data under `.wrangler/`, which is ignored by Git. Turnstile is
optional locally. To exercise it with Cloudflare's published test credentials:

```bash
cp site/.dev.vars.example site/.dev.vars
pnpm site:dev
```

The example contains only Cloudflare's public always-pass test keys. Never put a production secret
in a tracked file.

## Provision Cloudflare resources

The OpenTofu root under `infra/cloudflare/` owns the D1 database and private R2 bucket. It follows
the repository's pinned, encrypted-state workflow; see its README for backend bootstrap, token
permissions, protected plan/apply, and recovery details.

```bash
cp infra/cloudflare/terraform.tfvars.example infra/cloudflare/terraform.tfvars
cp infra/cloudflare/backend.hcl.example infra/cloudflare/backend.hcl

export CLOUDFLARE_API_TOKEN="..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export TF_VAR_state_encryption_passphrase="..."

tofu -chdir=infra/cloudflare init -backend-config=backend.hcl -lockfile=readonly
mkdir -p infra/cloudflare/.plans
tofu -chdir=infra/cloudflare plan -out=.plans/portal.tfplan
tofu -chdir=infra/cloudflare apply .plans/portal.tfplan
```

Copy `tofu -chdir=infra/cloudflare output -raw d1_database_id` into `site/wrangler.jsonc`, replacing
the all-zero placeholder. Confirm `r2_bucket_name` matches the `SUBMISSION_IMAGES` binding. Leave the
R2 bucket private; the Worker intentionally has no public image route.

Apply the production migration:

```bash
pnpm site:db:migrate:remote
```

Create a Turnstile widget restricted to the production hostname. Put its public site key in
`TURNSTILE_SITE_KEY` under `vars` in `site/wrangler.jsonc`, then store the secret through Wrangler:

```bash
pnpm wrangler secret put TURNSTILE_SECRET_KEY --config site/wrangler.jsonc
```

Set both Turnstile values together. Non-local submission requests fail closed when the secret is
missing, and every production upload requires a successfully verified, single-use token.
Turnstile is deliberately outside OpenTofu because the provider returns the widget secret into
state.

Deploy the Worker and its static assets:

```bash
pnpm site:deploy
```

## Review operations

List pending records without downloading image bodies:

```bash
pnpm wrangler d1 execute SUBMISSIONS_DB --remote --config site/wrangler.jsonc \
  --command "SELECT id, image_key, card_name, set_code, collector_number, quality, created_at FROM submissions WHERE status = 'pending' ORDER BY created_at;"
```

Download a chosen object by its exact `image_key`, review its label, and only then copy it into
`test-images/` and add an explicit disabled manifest entry. Follow `docs/regression-testing.md`
before enabling a new fixture. Update the D1 row to `accepted` or `rejected` as a separate operator
action; never treat portal metadata as reviewed truth.

## Safety limits

- accepted media: JPEG, PNG, or WebP only
- maximum image size: 10 MiB, checked before R2 buffering
- bounded field lengths and enumerated rarity/quality values
- five-second timeouts for Scryfall and Turnstile requests
- identifying `User-Agent` and `Accept` headers on Scryfall requests
- R2 object deletion when the D1 insert fails
- no public object reads or submission-list API
- mandatory Turnstile protection outside localhost, including server-side token verification
- CSP, frame, referrer, permissions, transport, and MIME-sniffing response headers

## Implementation references

- [Cloudflare Workers static asset bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare D1 Worker binding API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare D1 OpenTofu resource](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/d1_database)
- [Cloudflare R2 OpenTofu resource](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/r2_bucket)
- [Scryfall API access guidance](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17)
- [Scryfall card API](https://scryfall.com/docs/api/cards)
