import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInput, csvEscape, estimateCost, extractDuration, extractVideoUrl, summarize, toCsv } from "./lib.mjs";

const baseConfig = () => ({
  prompts: [{ id: "p1", text: "a scene" }],
  candidates: [{ name: "c1", endpoint: "vendor/model-video", price_per_second: 0.05, input: { duration: 6 } }],
});

test("validateConfig accepts a minimal config", async () => {
  const { validateConfig } = await import("./lib.mjs");
  assert.ok(validateConfig(baseConfig()));
});

test("validateConfig rejects empty prompts, bad endpoints and non-positive price", async () => {
  const { validateConfig } = await import("./lib.mjs");
  assert.throws(() => validateConfig({ prompts: [], candidates: baseConfig().candidates }), /prompts/);
  const bad = baseConfig();
  bad.candidates[0].endpoint = "no-slash";
  assert.throws(() => validateConfig(bad), /endpoint/);
  const free = baseConfig();
  free.candidates[0].price_per_second = 0;
  assert.throws(() => validateConfig(free), /price_per_second/);
});

test("buildInput merges prompt text and only adds references when the candidate uses them", () => {
  const candidate = { input: { duration: 6 }, uses_reference: true };
  assert.deepEqual(buildInput(candidate, { text: "scene" }, "https://fal.media/x.png"), {
    duration: 6,
    prompt: "scene",
    reference_image_urls: ["https://fal.media/x.png"],
  });
  assert.deepEqual(buildInput({ input: {} }, { text: "scene" }, "https://fal.media/x.png"), { prompt: "scene" });
});

test("estimateCost multiplies and rounds to four decimals", () => {
  assert.equal(estimateCost({ price_per_second: 0.08 }, 6), 0.48);
  assert.equal(estimateCost({ price_per_second: 0.02 }, 3.333), 0.0667);
});

test("csvEscape quotes commas, quotes and newlines", () => {
  assert.equal(csvEscape("plain"), "plain");
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape("two\nlines"), '"two\nlines"');
});

test("toCsv renders a header plus one row per result", () => {
  const csv = toCsv([
    { candidate: "c1", prompt: "p1", ok: true, latency_s: 1, duration_s: 6, est_cost_usd: 0.3, video_url: "https://fal.media/a.mp4", error: "" },
  ]);
  const [header, row] = csv.trimEnd().split("\n");
  assert.equal(header, "candidate,prompt,ok,latency_s,duration_s,est_cost_usd,video_url,error");
  assert.ok(row.startsWith("c1,p1,true,"));
});

test("summarize aggregates per candidate and sorts by cost", () => {
  const s = summarize([
    { candidate: "b", ok: true, duration_s: 6, est_cost_usd: 0.48, latency_s: 30 },
    { candidate: "a", ok: true, duration_s: 6, est_cost_usd: 0.12, latency_s: 10 },
    { candidate: "a", ok: false, duration_s: 0, est_cost_usd: 0, latency_s: 5 },
  ]);
  assert.deepEqual(s.map((x) => x.candidate), ["a", "b"]);
  assert.equal(s[0].runs, 2);
  assert.equal(s[0].ok, 1);
  assert.equal(s[0].est_cost_usd, 0.12);
  assert.equal(s[1].avg_latency_s, 30);
});

test("extractVideoUrl and extractDuration handle the two fal response shapes", () => {
  assert.equal(extractVideoUrl({ video: { url: "https://fal.media/a.mp4" } }), "https://fal.media/a.mp4");
  assert.equal(extractVideoUrl({ video_url: "https://fal.media/b.mp4" }), "https://fal.media/b.mp4");
  assert.equal(extractVideoUrl({ error: "nope" }), null);
  assert.equal(extractDuration({ duration: 6 }, 5), 6);
  assert.equal(extractDuration({}, 5), 5);
  assert.equal(extractDuration({}, undefined), 0);
});

test("eval --dry-run writes CSV/JSON end-to-end without network or a key", () => {
  const out = mkdtempSync(join(tmpdir(), "cost-eval-"));
  try {
    const run = spawnSync(process.execPath, ["eval.mjs", "--dry-run", "--out", out, "--limit", "3"], {
      cwd: new URL(".", import.meta.url).pathname,
      env: { ...process.env, FAL_KEY: "" },
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /wrote .*results\.csv/);
    const csv = readFileSync(join(out, "results.csv"), "utf8").trimEnd().split("\n");
    assert.equal(csv.length, 4);
    const json = JSON.parse(readFileSync(join(out, "results.json"), "utf8"));
    assert.equal(json.rows.length, 3);
    assert.ok(json.rows.every((r) => r.ok));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("eval exits non-zero without FAL_KEY outside dry-run", () => {
  const run = spawnSync(process.execPath, ["eval.mjs", "--limit", "1"], {
    cwd: new URL(".", import.meta.url).pathname,
    env: { ...process.env, FAL_KEY: "" },
    encoding: "utf8",
  });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /FAL_KEY/);
});
