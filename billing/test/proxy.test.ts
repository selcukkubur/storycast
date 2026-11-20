import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

async function setup() {
  const acc = await (
    await SELF.fetch("https://billing.local/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: "dev-1", idfv: "idfv-1" }),
    })
  ).json<{ account: string; token: string }>();
  const job = await (
    await SELF.fetch("https://billing.local/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${acc.token}` },
      body: JSON.stringify({ minutes: 1, resolution: "480P" }),
    })
  ).json<{ jobId: string }>();
  return { token: acc.token, jobId: job.jobId };
}

describe("fal proxy", () => {
  it("submits an allowlisted app and remembers the request", async () => {
    const { token, jobId } = await setup();
    const fal = vi.fn(async (_url: string) => new Response(JSON.stringify({ request_id: "req-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fal);

    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: "fal-ai/ffmpeg-api/metadata", input: { media_url: "https://fal.media/x.mp4" } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ request_id: "req-1" });
    expect(String(fal.mock.calls[0][0])).toBe("https://queue.fal.run/fal-ai/ffmpeg-api/metadata");

    const row = await db.DB.prepare("SELECT app FROM job_calls WHERE request_id = 'req-1'").first<{ app: string }>();
    expect(row?.app).toBe("fal-ai/ffmpeg-api/metadata");
  });

  it("refuses apps outside the allowlist", async () => {
    const { token, jobId } = await setup();
    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: "someone-else/expensive-model", input: {} }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses calls on jobs that are no longer running", async () => {
    const { token, jobId } = await setup();
    await db.DB.prepare("UPDATE jobs SET status = 'done' WHERE id = ?").bind(jobId).run();
    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: "fal-ai/ffmpeg-api/metadata", input: {} }),
    });
    expect(res.status).toBe(409);
  });

  it("proxies status for a remembered request", async () => {
    const { token, jobId } = await setup();
    await db.DB.prepare("INSERT INTO job_calls (request_id, job_id, app, created) VALUES ('req-9', ?, 'fal-ai/ffmpeg-api/metadata', 0)")
      .bind(jobId)
      .run();
    const fal = vi.fn(async (_url: string) => new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 }));
    vi.stubGlobal("fetch", fal);

    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls/req-9/status`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(String(fal.mock.calls[0][0])).toBe("https://queue.fal.run/fal-ai/ffmpeg-api/metadata/requests/req-9/status");
  });
});
