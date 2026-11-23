# Storycast mobile

Expo Router app that mirrors the web studio. Films are produced by the billing
worker (fal runs server-side); the app never holds a fal key.

- `npm run sync-data` — refresh the catalog snapshot from `web/` data.
- `npm run make-watermark` — regenerate the trial watermark card.
- `npm test` — vitest suite (`src/lib`, data and store tests).

## Real generation (P0)

The app talks to the billing worker; no fal key exists in the app.

1. Run the worker locally: `cd billing && npx wrangler dev --local --var DEV_CREDITS_TOKEN:dev-token`
2. Expose it: `cloudflared tunnel --url http://127.0.0.1:8787` → copy the https URL.
3. In `mobile/.env` (gitignored): `EXPO_PUBLIC_BILLING_API=https://<tunnel-host>`
4. Sync catalog data after web data changes: `npm run sync-data`
5. Regenerate the watermark card after edits: `npm run make-watermark`
6. Start the app: `npx expo start --tunnel --clear` (the watcher is unreliable here; restart per change batch)
7. Test credits: `curl -X POST -H "authorization: Bearer <token>" -H "x-dev-token: dev-token" -H "content-type: application/json" -d '{"credits":3}' <tunnel>/dev/credits`

Never set DEV_CREDITS_TOKEN in a deployed environment — the endpoint is staging-only (a production worker 404s it).

**Device checklist (P0 acceptance):** trial film 1 min 480P debits 1 ticket, real stages advance,
MP4 plays in the premiere card and in /watch; forced failure refunds; background warning appears;
relaunch offers Resume; generated film appears under "Made here".
