import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { buildInput, estimateCost, extractDuration, extractVideoUrl, summarize, toCsv, validateConfig } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const dry = flag("--dry-run");
const noDownload = flag("--no-download") || dry;
const configPath = resolve(opt("--config", "candidates.json"));
const outDir = resolve(opt("--out", "out"));
const only = opt("--candidate", "");
const limit = Number(opt("--limit", "0")) || Infinity;
const key = process.env.FAL_KEY ?? "";

const cfg = validateConfig(JSON.parse(readFileSync(configPath, "utf8")));
const candidates = cfg.candidates.filter((c) => !only || c.name === only);
if (!candidates.length) {
  console.error(`no candidate matches --candidate ${only}`);
  process.exit(2);
}
if (!dry && !key) {
  console.error("FAL_KEY is not set. Export FAL_KEY=... for live runs, or use --dry-run.");
  process.exit(2);
}

const headers = { authorization: `Key ${key}`, "content-type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url} answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function uploadLocalRef(refPath) {
  if (!refPath || /^https?:\/\//.test(refPath)) return refPath;
  const bytes = readFileSync(resolve(refPath));
  const type = extname(refPath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const init = await post("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    content_type: type,
    file_name: basename(refPath),
  });
  const put = await fetch(init.upload_url, { method: "PUT", headers: { "content-type": type }, body: bytes });
  if (!put.ok) throw new Error(`reference upload failed: ${put.status}`);
  return init.file_url;
}

async function submit(endpoint, input) {
  const { request_id } = await post(`https://queue.fal.run/${endpoint}`, input);
  return request_id;
}

async function follow(endpoint, requestId) {
  for (let i = 0; i < 120; i += 1) {
    const r = await fetch(`https://queue.fal.run/${endpoint}/requests/${requestId}/status`, { headers });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const { status } = await r.json();
    if (status === "COMPLETED") break;
    if (i === 119) throw new Error("timed out waiting for fal");
    await sleep(Math.min(15000, 1500 * (i + 1)));
  }
  const r = await fetch(`https://queue.fal.run/${endpoint}/requests/${requestId}`, { headers });
  if (!r.ok) throw new Error(`result ${r.status}`);
  return r.json();
}

async function runOne(candidate, prompt, refCache) {
  const seconds = Number(candidate.input?.duration) || 6;
  if (dry) {
    return {
      candidate: candidate.name,
      prompt: prompt.id,
      ok: true,
      latency_s: 0,
      duration_s: seconds,
      est_cost_usd: estimateCost(candidate, seconds),
      video_url: `dry://${candidate.name}/${prompt.id}.mp4`,
      error: "",
    };
  }
  const started = Date.now();
  try {
    let refUrl = "";
    if (candidate.uses_reference && prompt.ref) {
      refCache.set(prompt.ref, refCache.get(prompt.ref) ?? (await uploadLocalRef(prompt.ref)));
      refUrl = refCache.get(prompt.ref);
    }
    const requestId = await submit(candidate.endpoint, buildInput(candidate, prompt, refUrl));
    const data = await follow(candidate.endpoint, requestId);
    const videoUrl = extractVideoUrl(data);
    const duration = extractDuration(data, seconds);
    if (!videoUrl) throw new Error(`no video URL in result: ${JSON.stringify(data).slice(0, 200)}`);
    if (!noDownload) {
      const target = join(outDir, "videos", `${candidate.name}--${prompt.id}.mp4`);
      const r = await fetch(videoUrl);
      if (!r.ok) throw new Error(`download ${r.status}`);
      writeFileSync(target, Buffer.from(await r.arrayBuffer()));
    }
    return {
      candidate: candidate.name,
      prompt: prompt.id,
      ok: true,
      latency_s: Math.round((Date.now() - started) / 100) / 10,
      duration_s: duration,
      est_cost_usd: estimateCost(candidate, duration),
      video_url: videoUrl,
      error: "",
    };
  } catch (e) {
    return {
      candidate: candidate.name,
      prompt: prompt.id,
      ok: false,
      latency_s: Math.round((Date.now() - started) / 100) / 10,
      duration_s: 0,
      est_cost_usd: 0,
      video_url: "",
      error: String(e instanceof Error ? e.message : e).slice(0, 300),
    };
  }
}

mkdirSync(join(outDir, "videos"), { recursive: true });
const refCache = new Map();
const rows = [];
let count = 0;
outer: for (const candidate of candidates) {
  for (const prompt of cfg.prompts) {
    if (count >= limit) break outer;
    count += 1;
    const row = await runOne(candidate, prompt, refCache);
    rows.push(row);
    console.log(
      `${row.ok ? "ok  " : "FAIL"} ${row.candidate} / ${row.prompt} · ${row.duration_s}s · $${row.est_cost_usd}${row.ok ? "" : ` · ${row.error}`}`,
    );
  }
}

writeFileSync(join(outDir, "results.json"), JSON.stringify({ config: { prompts: cfg.prompts.length, candidates: candidates.length }, rows }, null, 2));
writeFileSync(join(outDir, "results.csv"), toCsv(rows));

const summary = summarize(rows);
console.log("\ncandidate               runs  ok  seconds  est_cost_usd  avg_latency_s");
for (const s of summary)
  console.log(`${s.candidate.padEnd(23)} ${String(s.runs).padStart(4)} ${String(s.ok).padStart(3)} ${String(s.seconds).padStart(8)} ${String(s.est_cost_usd).padStart(13)} ${String(s.avg_latency_s).padStart(13)}`);
console.log(`\nwrote ${join(outDir, "results.csv")} and results.json`);
if (!dry && !noDownload) console.log(`videos in ${join(outDir, "videos")}`);
