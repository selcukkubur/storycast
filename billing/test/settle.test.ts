import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls; DROP TABLE IF EXISTS job_assets;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function twoMinuteStarter(n = 1) {
  const acc = await (
    await SELF.fetch("https://billing.local/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: `dev-${n}`, idfv: `idfv-${n}` }),
    })
  ).json<{ account: string; token: string }>();
  await db.DB.prepare("UPDATE accounts SET plan = 'starter', expires_at = 9999999999 WHERE id = ?").bind(acc.account).run();
  await db.DB.prepare("INSERT INTO ledger (pool, kind, credits, ref, created) VALUES (?, 'grant', 4, ?, 0)")
    .bind(acc.account, `extra:${acc.account}`)
    .run();
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

/** Seed the asset ledger the way the proxied result route would. */
const seedAsset = (jobId: string, url: string, app = "fal-ai/ffmpeg-api/merge-audio-video") =>
  db.DB.prepare("INSERT INTO job_assets (job_id, url, app, created) VALUES (?, ?, ?, 0)").bind(jobId, url, app).run();

describe("settle", () => {
  it("keeps the full charge when the film is close to plan", async () => {
    const { token, jobId } = await twoMinuteStarter();
    await seedAsset(jobId, "https://fal.media/files/x/film.mp4");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ media: { duration: 95 } }), { status: 200 })));
    const res = await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/film.mp4" });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { refund: number; creditsLeft: number };
    expect(b.refund).toBe(0);
    expect(b.creditsLeft).toBe(3);
  });

  it("refunds a whole credit for a 30s film planned as 2 min", async () => {
    const { token, jobId } = await twoMinuteStarter();
    await seedAsset(jobId, "https://fal.media/files/x/short.mp4");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ media: { duration: 30 } }), { status: 200 })));
    const b = (await (await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/short.mp4" })).json()) as {
      refund: number;
      creditsLeft: number;
    };
    expect(b.refund).toBe(1);
    expect(b.creditsLeft).toBe(4);
  });

  it("refuses to settle as done on a URL the job never produced", async () => {
    const { token, jobId } = await twoMinuteStarter();
    await seedAsset(jobId, "https://fal.media/files/x/real.mp4");
    const fal = vi.fn(async () => new Response(JSON.stringify({ media: { duration: 30 } }), { status: 200 }));
    vi.stubGlobal("fetch", fal);

    const res = await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/borrowed.mp4" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("videoUrl was not produced by this job");
    // No metadata lookup is worth making for a URL this job did not produce.
    expect(fal).not.toHaveBeenCalled();

    const job = await db.DB.prepare("SELECT settled FROM jobs WHERE id = ?").bind(jobId).first<{ settled: number }>();
    expect(job?.settled).toBe(0);
  });

  it("records the video a result route returns and settles it as done", async () => {
    const { token, jobId } = await twoMinuteStarter();
    await db.DB.prepare("INSERT INTO job_calls (request_id, job_id, app, created) VALUES ('req-film', ?, 'fal-ai/ffmpeg-api/merge-audio-video', 0)")
      .bind(jobId)
      .run();
    const result = { video: { url: "https://fal.media/files/x/from-route.mp4" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(result), { status: 200 })),
    );

    const proxied = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls/req-film/result`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(proxied.status).toBe(200);
    expect(await proxied.json()).toEqual(result);

    const asset = await db.DB.prepare("SELECT app FROM job_assets WHERE job_id = ? AND url = ?")
      .bind(jobId, "https://fal.media/files/x/from-route.mp4")
      .first<{ app: string }>();
    expect(asset?.app).toBe("fal-ai/ffmpeg-api/merge-audio-video");

    // The same stub now answers the metadata lookup with a short film.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ media: { duration: 30 } }), { status: 200 })));
    const res = await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/from-route.mp4" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { refund: number }).refund).toBe(1);
  });

  it("refunds everything on error and is idempotent", async () => {
    const { token, jobId } = await twoMinuteStarter();
    const first = (await (await settle(token, jobId, { outcome: "error" })).json()) as { refund: number };
    const second = (await (await settle(token, jobId, { outcome: "error" })).json()) as { refund: number; already: boolean };
    expect(first.refund).toBe(2);
    expect(second).toMatchObject({ refund: 0, already: true });
  });

  it("refuses an error refund once the job has produced a film", async () => {
    const { token, jobId } = await twoMinuteStarter();
    await seedAsset(jobId, "https://fal.media/files/x/subtitled.mp4", "fal-ai/workflow-utilities/auto-subtitle");
    const fal = vi.fn(async () => new Response(JSON.stringify({ media: { duration: 30 } }), { status: 200 }));
    vi.stubGlobal("fetch", fal);

    const res = await settle(token, jobId, { outcome: "error" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("this job already produced a film; settle it as done");

    const job = await db.DB.prepare("SELECT settled, status FROM jobs WHERE id = ?")
      .bind(jobId)
      .first<{ settled: number; status: string }>();
    expect(job).toMatchObject({ settled: 0, status: "running" });
    const refunds = await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE ref = ?")
      .bind(`refund:${jobId}`)
      .first<{ n: number }>();
    expect(refunds?.n).toBe(0);
    expect(fal).not.toHaveBeenCalled();
  });

  it("still refunds an error when the job produced only intermediate clips", async () => {
    const { token, jobId } = await twoMinuteStarter();
    await seedAsset(jobId, "https://fal.media/files/x/clip.mp4", "fal-ai/workflow-utilities/trim-video");
    const b = (await (await settle(token, jobId, { outcome: "error" })).json()) as { refund: number };
    expect(b.refund).toBe(2);
  });

  it("rejects a non-fal video URL", async () => {
    const { token, jobId } = await twoMinuteStarter();
    const res = await settle(token, jobId, { outcome: "done", videoUrl: "https://evil.example/film.mp4" });
    expect(res.status).toBe(400);
  });

  it("stays unsettled and retryable when metadata has no usable duration", async () => {
    const { token, jobId } = await twoMinuteStarter();
    await seedAsset(jobId, "https://fal.media/files/x/film.mp4");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));

    const first = await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/film.mp4" });
    expect(first.status).toBe(502);

    const job = await db.DB.prepare("SELECT settled, status, video_url FROM jobs WHERE id = ?")
      .bind(jobId)
      .first<{ settled: number; status: string; video_url: string | null }>();
    expect(job?.settled).toBe(0);
    expect(job?.status).toBe("running");
    expect(job?.video_url).toBeNull();

    const refunds = await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE ref = ?")
      .bind(`refund:${jobId}`)
      .first<{ n: number }>();
    expect(refunds?.n).toBe(0);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ media: { duration: 30 } }), { status: 200 })));
    const second = await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/film.mp4" });
    expect(second.status).toBe(200);
    const b = (await second.json()) as { refund: number; creditsLeft: number };
    expect(b.refund).toBe(1);
    expect(b.creditsLeft).toBe(4);
  });

  it("treats a non-positive or non-numeric duration as unusable", async () => {
    const bodys = [{ media: { duration: 0 } }, { media: { duration: "abc" } }, { media: { duration: -5 } }, { media: null }];
    for (const [i, body] of bodys.entries()) {
      const { token, jobId } = await twoMinuteStarter(i + 1);
      await seedAsset(jobId, "https://fal.media/files/x/film.mp4");
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
      const res = await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/film.mp4" });
      expect(res.status).toBe(502);
      const job = await db.DB.prepare("SELECT settled FROM jobs WHERE id = ?").bind(jobId).first<{ settled: number }>();
      expect(job?.settled).toBe(0);
    }
  });

  it("hides another account's job behind a 404", async () => {
    const { jobId } = await twoMinuteStarter();
    const other = await (
      await SELF.fetch("https://billing.local/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device: "dev-2", idfv: "idfv-2" }),
      })
    ).json<{ token: string }>();
    const res = await settle(other.token, jobId, { outcome: "error" });
    expect(res.status).toBe(404);
    const job = await db.DB.prepare("SELECT settled FROM jobs WHERE id = ?").bind(jobId).first<{ settled: number }>();
    expect(job?.settled).toBe(0);
  });
});
