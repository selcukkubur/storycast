# Storycast Mobile — Real Film Generation (P0) Design

- **Date:** 2026-11-22
- **Status:** Approved for spec review
- **Scope:** Mobile app (Expo/RN) can produce real films end-to-end through the existing billing worker
- **Prerequisite:** Billing worker (PR #1) deployed or running locally behind a tunnel; `DEV_CREDITS_TOKEN` for staging

## 1. Context

The mobile app is currently a UI shell: creating a film charges a mock ticket and the production screen is a timed animation. The web app contains the real pipeline (director → character → voice → keyframes → shots → score → edit → subtitles) but is BYOK and browser-only. P0 ports that engine to mobile and connects it to the managed billing worker so a parent can make a real film on iPhone.

Gap analysis (2026-11-22) established the program order: **P0 real generation** → P1 catalog parity → P2 trust features → P3 community/system. This spec covers only P0.

## 2. Goals / Non-goals

**Goals**
- Composer → real job (credits debited) → live stage events → real MP4 → playable premiere, with refund on failure and resume after interruption.
- Trial films (1 min, 480P, one per device) work end-to-end with a branded watermark.
- Zero changes to the web app for this phase.

**Non-goals**
- Real StoreKit purchases (mock purchase sheet stays, labeled as demo).
- Voice auditions, 50-narrator / 26-style parity, Explore, issue reporting (P1–P3).
- Background completion (Phase 2: Durable Object orchestration + push).

## 3. Decisions

1. **Client-run pipeline (Phase 1).** The pipeline executes in the app against the billing worker proxy, like the web executes against fal. iOS suspends JS when backgrounded; the UI must therefore require the app to stay open. The previous "safe to leave" copy is removed — replaced by a "Keep Storycast open" guard plus resume support. Server orchestration is Phase 2.
2. **Copy-adapt, don't refactor web.** `director.ts`, `pipeline.ts`, `cost.ts` and stage mapping are ported to `mobile/src/lib/studio/` with adapters (fal calls → billing client, storage → AsyncStorage, voice check → pass-through). A later spec unifies web+mobile into a shared package; duplication is tracked, not hidden.
3. **Trial watermark via compose append.** No pipeline rework: trial jobs append a bundled 2-second branded card clip (built with `images-to-video` through the proxy) immediately before the existing end card.
4. **Device identity, not accounts.** `POST /accounts {device, idfv}` issues a bearer token stored in `expo-secure-store`. Trial = 1 credit server-side. No sign-in in P0.
5. **Dev credits endpoint.** The worker gains `POST /dev/credits` (auth required, plus `DEV_CREDITS_TOKEN` header) that grants N credits to the caller's wallet. It exists so repeated test films don't require device re-registration; it is disabled unless the secret is set. Production deploys must not set the secret.

## 4. Architecture

```
app/(tabs)/create (flow1)                 mobile/src/lib/studio/*
  composer state ───────────────────────▶ createFilmRecord(input)
  parental gate                          │
  "Make the film" ──▶ billing.startFilm ─┤  pipeline.run():
                                          │    director (openrouter/router via proxy)
                                          │    character sheet/hero, keyframes, TTS,
                                          │    shots, score, end card, watermarks, assemble
  rolling screen ◀── onEvent(stage,msg) ──┤  each fal call → billing.call(app, input)
  refund + retry ◀── settle("error") ─────┤  on done → billing.settle("done", videoUrl)
  premiere ◀── rec.result.video ──────────┘
```

**New modules**
- `mobile/src/lib/billing.ts` — protocol client: `registerDevice`, `wallet`, `startFilm(minutes, resolution)`, `call(app, input)` (submit/poll/result), `upload(file)`, `settle(outcome, videoUrl?)`, `devTopUp(credits)`. Errors map to `BillingError { status, reason }`; 401 clears the stored token.
- `mobile/src/lib/studio/{director,pipeline,cost,stages}.ts` — adapted from `web/src/lib/studio/`, imports rewritten; `fal.run/duration/upload` replaced by the billing client; `localStorage` store replaced by AsyncStorage (`storycast.films.v1`); `checkVoice` returns `{ speaks: true }` for P0.
- `mobile/src/lib/studio/data.ts` — loads bundled `config.json` (characters incl. remote `sheet`/`hero`, styles incl. remote `ref`, languages) and `films.json` (seed catalog) from `mobile/assets/data/`, copied at build-prep time from `web/public/data/`.
- `mobile/src/lib/stage-map.ts` — pipeline event `stage` → the 8 UI stages used by the rolling screen.

**Modified**
- `flow1-make-film.tsx`: gate pass → `startFilm` (real debit) → pipeline with event callbacks; rolling screen renders real progress (completed-stage share); failure screen gains refund + retry; success screen uses the real video. "Keep Storycast open" guard via `AppState` warning and a persistent card replacing the old safe-to-leave copy.
- `flow3-watch-share.tsx`: accepts generated films (AsyncStorage) in addition to seeds; `openFilm` resolves by id across both.
- Home library merges generated films newest-first and shows the `New` badge for them.
- `flow2-paywall.tsx`: mock store sheet labeled "Demo purchase"; no credit changes in P0.

## 5. Data flow (one film)

1. `startFilm` → `POST /jobs` → server validates plan caps, debits credits, returns `{jobId, cost, watermark}`.
2. Pipeline steps run serially (existing web logic, ~65–220 fal calls). Every call is `POST /jobs/:id/calls` then poll status/result via the worker.
3. Events (`stage`, `msg`, at) update the rolling screen; the record checkpoint (plan, assets, block audio) is persisted to AsyncStorage after each stage.
4. `settle("done", deliverableUrl)` → server verifies duration against the job's recorded final asset, refunds any shortfall, returns `{refund, creditsLeft}`; wallet chip refreshes.
5. Terminal error → `settle("error")` → full refund; UI shows "That film didn't use any credits" + Retry (new job) or Resume (same job if plan exists).

## 6. Error handling

- Network/fal transient errors: existing pipeline retries; a failed `call` surfaces as stage failure with retry of the whole stage checkpoint.
- App backgrounded mid-production: JS suspends; on foreground, if no progress for >90 s, offer Resume (pipeline resumes from saved state) or Cancel (settle error → refund).
- Worker 401: token cleared, one re-registration attempt (409 means device exists — surface "restore device" message; recovery endpoint is out of scope in P0).
- Insufficient credits/caps: server 402/422 mapped to the paywall upsell.
- Settle failure after a successful film: keep the video URL locally and retry settle silently up to 3 times; wallet shows a "pending" note.

## 7. Dev environment

- `billing/` runs with `npx wrangler dev --local` and a `cloudflared tunnel --url http://127.0.0.1:8787` quick tunnel; `EXPO_PUBLIC_BILLING_API` points at the tunnel URL in `mobile/.env` (gitignored).
- `DEV_CREDITS_TOKEN` set locally (`wrangler dev --var`), unset in any deployed environment.
- Seed data copied by a script (`mobile/scripts/sync-data.mjs`) from `web/public/data/{config,films}.json` into `mobile/assets/data/` so the app ships self-contained data.
- Metro watcher is unreliable in this environment; the dev loop assumes a `--clear` restart per change batch (documented in the mobile README).

## 8. Testing

- Unit (vitest, node): `cost.ts` estimates vs server parity table; `stage-map` completeness; billing client protocol with mocked fetch (register → start → call/poll → settle; 401 clears token; 402 surfaces reason).
- Pipeline adapter test: stubbed `call()` returning canned fal outputs drives a 1-block film to `done` and produces a settle call with the deliverable URL.
- Device E2E (manual, documented checklist): trial device → 1-min 480P film → debit 1 credit → stages advance → MP4 plays in the player → wallet shows 0; forced failure (disable network mid-shots) → error screen → refund restores the credit; backgrounding shows the warning; relaunch offers Resume.

## 9. Risks

| Risk | Mitigation |
|---|---|
| iOS suspends JS mid-job | Foreground guard + persisted checkpoints + resume; Phase 2 removes the constraint |
| ~65–220 proxy calls per film → failure churn | Existing retries, 400-call cap server-side, resume from stage checkpoints |
| Trial = 1 credit; testers rerun often | `DEV_CREDITS_TOKEN` staging endpoint |
| Copied pipeline drifts from web | Shared-package unification spec queued; stage-map test guards UI drift |
| Worker not yet deployed | Local `wrangler dev` + quick tunnel for P0; deploy prerequisites already documented |

## 10. Acceptance criteria

- A trial device can produce a real playable film with one tap after the parental gate; the film appears in the library and plays in the player.
- Wallet debits/refunds match server responses; no film can start without a server-issued job.
- The rolling screen reflects real pipeline stages (no timers), and interrupted jobs are resumable.
- `tsc` clean, new unit tests pass, and the documented device checklist passes.
