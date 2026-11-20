export function validateConfig(cfg) {
  if (!cfg || typeof cfg !== "object") throw new Error("config must be an object");
  if (!Array.isArray(cfg.prompts) || cfg.prompts.length === 0) throw new Error("config needs a non-empty prompts array");
  if (!Array.isArray(cfg.candidates) || cfg.candidates.length === 0) throw new Error("config needs a non-empty candidates array");
  for (const p of cfg.prompts) {
    if (typeof p?.id !== "string" || !p.id) throw new Error(`prompt needs an id: ${JSON.stringify(p)}`);
    if (typeof p?.text !== "string" || !p.text) throw new Error(`prompt ${p.id} needs text`);
  }
  for (const c of cfg.candidates) {
    if (typeof c?.name !== "string" || !c.name) throw new Error(`candidate needs a name: ${JSON.stringify(c)}`);
    if (typeof c?.endpoint !== "string" || !c.endpoint.includes("/")) throw new Error(`candidate ${c.name} needs a fal endpoint slug`);
    if (typeof c?.price_per_second !== "number" || !(c.price_per_second > 0))
      throw new Error(`candidate ${c.name} needs price_per_second > 0`);
  }
  return cfg;
}

export function buildInput(candidate, prompt, refUrl) {
  const input = { ...(candidate.input ?? {}), prompt: prompt.text };
  if (candidate.uses_reference && refUrl) input.reference_image_urls = [refUrl];
  return input;
}

export const estimateCost = (candidate, seconds) => Math.round(candidate.price_per_second * seconds * 10000) / 10000;

export function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const CSV_COLUMNS = ["candidate", "prompt", "ok", "latency_s", "duration_s", "est_cost_usd", "video_url", "error"];

export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((col) => csvEscape(row[col])).join(","));
  return lines.join("\n") + "\n";
}

export function summarize(rows) {
  const byCandidate = new Map();
  for (const row of rows) {
    const s = byCandidate.get(row.candidate) ?? { candidate: row.candidate, runs: 0, ok: 0, seconds: 0, cost: 0, latency: 0 };
    s.runs += 1;
    s.seconds += Number(row.duration_s) || 0;
    s.cost += Number(row.est_cost_usd) || 0;
    if (row.ok) {
      s.ok += 1;
      s.latency += Number(row.latency_s) || 0;
    }
    byCandidate.set(row.candidate, s);
  }
  return [...byCandidate.values()]
    .map((s) => ({
      candidate: s.candidate,
      runs: s.runs,
      ok: s.ok,
      seconds: Math.round(s.seconds * 10) / 10,
      est_cost_usd: Math.round(s.cost * 10000) / 10000,
      avg_latency_s: s.ok ? Math.round((s.latency / s.ok) * 10) / 10 : 0,
    }))
    .sort((a, b) => a.est_cost_usd - b.est_cost_usd);
}

export function extractVideoUrl(data) {
  const url = data?.video?.url ?? data?.video_url ?? data?.output?.video?.url;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

export function extractDuration(data, fallback) {
  const d = Number(data?.duration ?? data?.video?.duration ?? fallback);
  return Number.isFinite(d) && d > 0 ? d : Number(fallback) || 0;
}
