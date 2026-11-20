import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

async function twoMinuteStarter() {
  const acc = await (
    await SELF.fetch("https://billing.local/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: "dev-1", idfv: "idfv-1" }),
    })
  ).json<{ account: string; token: string }>();
  await db.DB.prepare("UPDATE accounts SET plan = 'starter', expires_at = 9999999999 WHERE id = ?").bind(acc.account).run();
  await db.DB.prepare("INSERT INTO ledger (pool, kind, credits, ref, created) VALUES (?, 'grant', 4, 'extra', 0)").bind(acc.account).run();
  const job = await (
    await SELF.fetch("https://billing.local/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${acc.token}` },
      body: JSON.stringify({ minutes: 2, resolution: "480P" }),
    })
  ).json<{ jobId: string }>();
  return { token: acc.token, jobId: job.jobId };
}

const settle = (token: string, jobId: string, payload: Record<string, unknown>) =>
  SELF.fetch(`https://billing.local/jobs/${jobId}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

describe("settle", () => {
  it("keeps the full charge when the film is close to plan", async () => {
    const { token, jobId } = await twoMinuteStarter();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ media: { duration: 95 } }), { status: 200 })));
    const res = await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/film.mp4" });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { refund: number; creditsLeft: number };
    expect(b.refund).toBe(0);
    expect(b.creditsLeft).toBe(3);
  });

  it("refunds a whole credit for a 30s film planned as 2 min", async () => {
    const { token, jobId } = await twoMinuteStarter();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ media: { duration: 30 } }), { status: 200 })));
    const b = (await (await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/short.mp4" })).json()) as {
      refund: number;
      creditsLeft: number;
    };
    expect(b.refund).toBe(1);
    expect(b.creditsLeft).toBe(4);
  });

  it("refunds everything on error and is idempotent", async () => {
    const { token, jobId } = await twoMinuteStarter();
    const first = (await (await settle(token, jobId, { outcome: "error" })).json()) as { refund: number };
    const second = (await (await settle(token, jobId, { outcome: "error" })).json()) as { refund: number; already: boolean };
    expect(first.refund).toBe(2);
    expect(second).toMatchObject({ refund: 0, already: true });
  });

  it("rejects a non-fal video URL", async () => {
    const { token, jobId } = await twoMinuteStarter();
    const res = await settle(token, jobId, { outcome: "done", videoUrl: "https://evil.example/film.mp4" });
    expect(res.status).toBe(400);
  });
});
