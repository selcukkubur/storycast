# Storycast billing

Credits, plans, App Store subscriptions and the fal proxy for the managed-compute iOS app.
Design: `docs/superpowers/specs/2026-11-20-storycast-ios-pricing-design.md`

## Plans

| Plan | Allowance | Cap |
|---|---|---|
| trial | 1 credit once | 1 min, 480P only |
| starter | 3 credits/mo | 2 min/film |
| family | 5 credits/mo shared | 5 min/film |

1 credit = 1 film-minute at 480P; 768P costs 2 credits/min. Unused plan credits roll one month, up to 2x the allowance.

## Client integration

- `POST /jobs` answers with `watermark` (`true` while the account is on the trial plan). The client is responsible for rendering that watermark on the finished film; the server never burns it in.
- The iOS client generates an `appAccountToken` (a UUID) before purchase and keeps it stable for the account. Besides receipt binding it is the Family Sharing link key: a member presenting the subscriber's receipt is linked into the family pool instead of getting a 409.
- Nightly wallet ↔ App Store reconciliation (spec section 8) is a planned follow-up, tracked as plan A2. Nothing currently re-checks purchases or revokes credits on its own; the client syncs on launch.

## Setup

```bash
npm install
npx wrangler d1 create storycast-billing        # paste database_id into wrangler.jsonc
npx wrangler d1 execute storycast-billing --remote --file schema.sql
npx wrangler secret put FAL_KEY                 # server-side fal key; never shipped in apps
npx wrangler secret put HASH_SALT               # random 32+ chars
npx wrangler secret put APPLE_ISSUER            # App Store Connect issuer id
npx wrangler secret put APPLE_KEY_ID            # .p8 key id
npx wrangler secret put APPLE_PRIVATE_KEY       # .p8 contents
npx wrangler secret put APPLE_BUNDLE_ID         # com.storycast.app
```

Products: `com.storycast.starter.monthly|yearly`, `com.storycast.family.monthly|yearly`, `com.storycast.topup.1|3`.

## Develop

Local D1 starts empty, so apply the schema before the first run. `wrangler dev` also reads secrets from
`.dev.vars` (gitignored); a missing `HASH_SALT` silently hashes with the literal `"undefined"`, so mixing
runs creates duplicate accounts. Create the file with a local-only salt:

```bash
npm install
npm run db:init:local    # npx wrangler d1 execute storycast-billing --local --file schema.sql
echo 'HASH_SALT=dev-salt-change-me' > .dev.vars
npm run dev              # wrangler dev on http://127.0.0.1:8787
npm test                 # vitest-pool-workers
```

`npm run dev` blocks, so run the smoke script in a second terminal once the worker is up:

```bash
node scripts/smoke.mjs   # prints 7 ok lines, then "smoke passed"
```

Never commit `.dev.vars`; use a real random salt for deployed workers (`wrangler secret put HASH_SALT`).

## Deploy

```bash
npx wrangler deploy
```

Point the App Store Server Notifications URL at `https://<worker-host>/apple/notifications` (Sandbox and Production).

Never set DEV_CREDITS_TOKEN in a deployed environment — the endpoint is staging-only.

## Launch gate

Subscriptions go live only when COGS <= $2.75 per 480P minute (spec section 4).

## Reconciliation (cron)

The worker runs a nightly repair pass (`triggers.crons` in `wrangler.jsonc`, 03:17 UTC). It re-reads every account with a stored `orig_txn` from the App Store Server API and repairs what webhooks missed: active subscriptions get plan/expiry refreshed and the month's grant re-applied (idempotent through the ledger ref), lapsed or revoked ones drop to trial terms. Members without their own receipt are untouched (they follow the owner's subscription).

Trigger it locally:

```bash
npx wrangler dev --test-scheduled
curl "http://127.0.0.1:8787/__scheduled?cron=17+3+*+*+*"
```
