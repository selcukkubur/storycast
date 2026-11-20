# Storycast iOS — User Plans & Pricing Design

- **Date:** 2026-11-20
- **Status:** Approved for spec review
- **Scope:** Monetization for the Storycast iOS app (managed compute model)
- **Prerequisite:** Cost program (see §5) — plans are loss-making at current fal.ai prices

## 1. Context

Storycast ("Type a topic. Get a story.") generates 1–10 minute narrated animated films end-to-end on fal.ai. The web app is BYOK (users bring their own fal key). This design covers the **iOS app**, where the app itself pays for compute and recovers it through App Store subscriptions and consumable credit packs.

Decisions already made in brainstorming:

- **Money model:** managed only — the app pays fal.ai; no BYOK on iOS.
- **Audience:** families — parents buy, kids consume. Explanist content, 50 preset narrators.
- **Structure:** minutes wallet (credits) + two subscriptions + top-up packs.

Unit cost reality (from `web/src/lib/studio/cost.ts` and pipeline analysis):

- 1 min film ≈ **$4.50 (480P) / $6.50 (768P)** of fal compute today.
- Cost scales linearly with the length slider — a 10 min 768P film ≈ $40–50.
- Apple takes 15% with the Small Business Program (enroll day one), 30% otherwise.

Therefore every plan is a **minutes budget with per-film caps**; no unlimited tiers.

## 2. Goals / Non-goals

**Goals**

- A pricing lineup parents accept ($10–20/mo flagship) that never produces a negative-margin month per subscriber.
- Worst-case COGS bounded by design (caps), not by user discipline.
- Family Sharing compatible (shared credit pool).
- StoreKit 2 + App Store Server Notifications v2 as the source of truth.

**Non-goals**

- BYOK on iOS (web keeps it).
- B2B/education volume licensing (revisit post-launch).
- Android, per-user usage analytics beyond the metrics in §9.
- Kids Category listing — we position as Education "made for families", parent-operated.

## 3. Plan lineup

1 credit = 1 film-minute at 480P. 768P consumes 2 credits per minute.

| Plan | Price | Included | Caps & gates | COGS (optimized)* |
|---|---|---|---|---|
| **Trial** (once per Apple ID) | $0 | 1 film | 1 min, 480P, watermark, preset narrators only | ~$2.50 (CAC) |
| **Starter** | $12.99/mo · $89.99/yr | 3 credits/mo | ≤2 min/film; 768P allowed at 2× rate; watermark off; download/share | $7.50 worst / $6.00 best per month |
| **Family** | $19.99/mo · $139.99/yr | 5 credits/mo, shared via Family Sharing | ≤5 min/film; custom character creation; priority queue | $12.50 worst / $10.00 best per month |
| **Top-ups** (consumable) | $4.99 = 1 credit · $12.99 = 3 | same wallet | not shareable via Family Sharing | $2.50 per credit |

\* Optimized COGS assumes the cost program in §5 (≈ $2.50 per 480P minute).

**Credit rules**

- Charge estimate at job start: `credits = ceil(planned_minutes × resolution_multiplier)` (1 for 480P, 2 for 768P).
- Settle on completion; refund the difference if the finished film is ≥10% shorter than planned.
- Full automatic refund on hard job failure (the pipeline already retries transient errors; only terminal failures refund).
- Rollover: unused plan credits roll one month, capped at 2× the plan allowance (Starter max 6, Family max 10). Top-up credits do not expire while the subscription is active.
- Regional pricing: App Store price tiers with PPP adjustment (~60% of US in TR/LATAM/SEA markets).

**Price floor rule:** per-credit gross price never below COGS per credit × 1.7.

## 4. Unit economics & launch gate

| Per credit (480P minute) | Starter net | Family net | Top-up net |
|---|---|---|---|
| Gross | $4.33 | $4.00 | $4.99–4.33 |
| After Apple 15% | $3.68 | $3.40 | $4.24–3.68 |
| COGS optimized | $2.50 | $2.50 | $2.50 |
| **Gross margin** | **~32%** | **~26%** | **~41–32%** |
| COGS today | $4.50 | $4.50 | $4.50 |
| **Margin today** | **−22%** | **−32%** | **−6 to −22%** |

**Launch gate:** subscriptions may go live only when COGS ≤ **$2.75 per 480P minute**. If the cost program lands above that, reprice (≈ $15.99 Starter / $24.99 Family at $4.50 COGS, ~12%/8% margin) or ship 45-second "story cards" as the base-tier length instead of raising prices past family tolerance.

## 5. Cost program (hard dependency)

From the November 2026 vendor analysis; each item keeps current features:

1. Video tier: MiniMax H3 non-Max/Lite tier for the existing 480P mode; evaluate Grok Imagine 1.5 Lite ($0.02/s) for ambient V-shots behind a flag with a 20-clip consistency A/B.
2. ElevenLabs TTS + Music called direct (≈25% and ≈60% cheaper than fal pass-through, same models/voices).
3. LLM direction via OpenRouter direct; mechanical calls (line resize, rephrase, vision checks) on Gemini Flash-class models; Opus only for the director plan.
4. Keep fal for orchestration and ffmpeg utilities (≈1% of BOM).

The credit-economy design (credits, not dollars, shown to users) buffers future model price drift.

## 6. Enforcement architecture

- **No fal key in the app binary.** A Cloudflare Worker (new `billing/`, reusing the D1/R2 patterns from `share/`) holds the fal key server-side and proxies every fal queue submission and upload. The client talks only to the worker; polling semantics stay client-side.
- **D1 tables:** `accounts` (apple_sub, family_group), `wallets`, `ledger`, `jobs`, `packs`.
- **Job flow:** client posts job (topic, plan, minutes, resolution) → worker computes cost, checks caps and balance, debits, submits to fal, returns job id → client polls → worker settles/refunds.
- **Apple source of truth:** StoreKit 2 transactions + App Store Server Notifications v2 webhook drive subscription state; one receipt per family group — the pool is keyed to the subscription owner; each member restores the shared subscription with their own Apple ID.
- **Consumables:** wallet-local to the purchaser; never shared (Apple does not share consumable purchases).
- **Abuse controls:** trial bound per Apple ID + `identifierForVendor` + parental gate; one concurrent film per account (matches the existing serial pipeline chain); rate limit per day; refund-on-failure only for terminal errors.
- **Trial watermark:** end-card mark applied in the existing compose step; trial films are not shareable to Explore.

## 7. Paywall moments

1. Trial film completes → "keep making films" sheet (proven-intent moment).
2. Composer cost preview ("this 3 min at 768P = 6 credits, you have 3") → inline top-up or upgrade, never a dead-end error.
3. Cap attempts (longer film, 768P on Trial, custom narrator on Starter) → contextual upgrade sheet.
4. Credits exhausted mid-month → top-up first, upgrade second.

All purchase surfaces sit behind a parental gate (math challenge) — Apple requirement for kids-facing apps, and it protects against kid-initiated purchases. No external links anywhere in the app (the web's "Copy agent prompt" feature is excluded on iOS).

## 8. Error handling

- Insufficient credits / cap exceeded: block before submission with an actionable sheet.
- Worker→fal failure after debit: automatic refund entry in `ledger`; user sees "that film didn't use any credits."
- Apple notification gaps: nightly reconciliation job against StoreKit transaction history; wallets are idempotent per transaction id.
- Streamed/proxy downtime: client shows retryable banner; debits only occur at successful submission.

## 9. Metrics & success criteria

- Trial → paid conversion: 8–15%
- Monthly churn: < 8%
- Gross margin: ≥ 25% (target 30%)
- Median film length: ≤ 2 min
- Top-up attach rate: ≥ 15% of Family subscribers
- Credit utilization: 65–80% of monthly allowance

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| fal price drift raises COGS | credits-denominated plans; price floor rule; quarterly review |
| Family pool arbitrage (6 members, 5 credits) | pool is fixed and shared — no per-member copy of the allowance |
| Multi-Apple-ID trial abuse | device + ID binding, parental gate, per-day limits |
| Refund abuse on terminal failures | refund only terminal errors, idempotent ledger |
| Apple policy shift (external purchase links, US/EU) | architecture keeps wallet server-side; links can be added later without plan changes |
| Cost program underdelivers | launch gate §4; story-card fallback |

## 11. Open questions

- Whether Starter should include 768P at launch or remain 480P-only (current: allowed at 2× rate).
- Annual-plan rollover interplay (current: same rules as monthly).
- Web↔iOS wallet unification (deferred; web stays BYOK).
- Custom narrator cost is ~$0.15 (2 images + 1 LLM step) — currently free on Family to drive stickiness; revisit if abuse appears.

## 12. Implementation dependencies (for the plan)

1. Cost program evaluation (§5) — gates launch pricing.
2. `billing/` worker: wallet, ledger, Apple notifications, fal proxy.
3. Client refactor of `web/src/lib/studio/fal.ts` from direct fal calls to the billing proxy (interface-compatible `run()`).
4. StoreKit 2 subscription + consumable flows, parental gate UI.
5. Paywall surfaces (§7) — screen design handed to `/flow-mobile` after this spec.
