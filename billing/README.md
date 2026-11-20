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

```bash
npm run dev          # wrangler dev on http://127.0.0.1:8787
npm test             # vitest-pool-workers
node scripts/smoke.mjs
```

## Deploy

```bash
npx wrangler deploy
```

Point the App Store Server Notifications URL at `https://<worker-host>/apple/notifications` (Sandbox and Production).

## Launch gate

Subscriptions go live only when COGS <= $2.75 per 480P minute (spec section 4).
