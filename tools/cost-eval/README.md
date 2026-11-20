# Storycast cost-eval

Side-by-side comparison harness for alternative fal video models against the current production stack (MiniMax H3 Max reference-to-video). This is Plan B from the iOS pricing design: it exists to prove the **launch gate — COGS ≤ $2.75 per 480P minute** — before subscription prices go live.

Video generation is ~85–90% of a film's cost, so video is the only step worth an A/B at this stage. TTS/music/LLM routing changes keep the same models and only recover reseller margin; they do not need a quality test.

## What it produces

For every candidate model × every prompt:

- one downloaded clip (`out/videos/<candidate>--<prompt>.mp4`)
- one row in `out/results.csv` / `out/results.json`: latency, rendered duration, estimated cost, video URL, error
- a per-candidate cost summary printed at the end

## Run

Dry run (no key, no network — validates the harness):

```bash
cd tools/cost-eval
npm test          # 10 node:test cases, incl. an end-to-end dry run
npm run dry       # writes out/results.csv with synthetic rows
```

Live run (spends real money — budget below):

```bash
cd tools/cost-eval
export FAL_KEY=...
npm run eval -- --out out-$(date +%Y%m%d)
# narrow a run: --limit 6 --candidate h3-highspeed-480
```

Reference images: prompts that name a `ref` path get that local image uploaded to fal storage automatically (PNG/JPG). The defaults point at the existing character portraits in `web/public/static/characters/`.

## Budget

3 candidates × 6 prompts × 6 s ≈ 108 generated seconds. At $0.02–0.08/s that is roughly **$3–7 per full pass**. Reruns after prompt fixes cost the same again; use `--candidate` and `--limit` while iterating.

## Before running

`candidates.json` is a data file — confirm the exact fal endpoint slugs on fal.ai model pages first:
the H3 family in production is `minimax/h3-max/reference-to-video`; the Lite/Highspeed slugs and the
Grok Imagine 1.5 Lite slug must be copied from their fal pages and pasted in. Prices there are list
prices as of November 2026 and can drift — update `price_per_second` when you verify.

## How to decide

1. Watch every clip pair (candidate vs `h3-max-768`) at full size, muted and unmuted.
2. Score each clip 1–5 on: character consistency, motion naturalness, style adherence, artifacts.
3. Pick the cheapest candidate whose mean score is within **0.5 points** of H3 Max.

Record the outcome here (fill after a real pass):

| Candidate | $/s | Mean score | Verdict | Notes |
|---|---|---|---|---|
| h3-max-768 (baseline) | 0.08 | | | |
| h3-highspeed-480 | 0.04 | | | |
| grok-imagine-1.5-lite | 0.02 | | | |

Decision: _pending a live pass_ — if the winner's per-second price drops effective COGS below $2.75 per 480P minute, the gate in `docs/superpowers/specs/2026-11-20-storycast-ios-pricing-design.md` §4 is cleared; otherwise the fallback in that section (45-second story cards on the base tier) applies.
