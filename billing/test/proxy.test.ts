import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function register(device: string) {
  const res = await SELF.fetch("https://billing.local/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device, idfv: `idfv-${device}` }),
  });
  return res.json<{ account: string; token: string }>();
}

async function setup() {
  const acc = await register("dev-1");
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
    const fal = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ request_id: "req-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fal);

    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: "fal-ai/ffmpeg-api/metadata", input: { media_url: "https://fal.media/x.mp4" } }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ request_id: "req-1" });
    expect(text).not.toContain("test-fal-key");
    expect(String(fal.mock.calls[0][0])).toBe("https://queue.fal.run/fal-ai/ffmpeg-api/metadata");
    const headers = fal.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.authorization).toBe("Key test-fal-key");

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
    const fal = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 }));
    vi.stubGlobal("fetch", fal);

    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls/req-9/status`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(String(fal.mock.calls[0][0])).toBe("https://queue.fal.run/fal-ai/ffmpeg-api/metadata/requests/req-9/status");
  });

  it("uploads a file through the fal storage handshake", async () => {
    const { token } = await setup();
    const fal = vi.fn(async (url: string, _init: RequestInit) =>
      String(url).includes("/storage/upload/initiate")
        ? new Response(JSON.stringify({ upload_url: "https://upload.example/x", file_url: "https://fal.media/files/u/x.png" }), { status: 200 })
        : new Response(null, { status: 200 }),
    );
    vi.stubGlobal("fetch", fal);

    const form = new FormData();
    form.set("file", new File([new Uint8Array(16)], "x.png", { type: "image/png" }));

    const res = await SELF.fetch("https://billing.local/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://fal.media/files/u/x.png" });

    expect(fal).toHaveBeenCalledTimes(2);
    expect(String(fal.mock.calls[0][0])).toBe("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3");
    const initHeaders = fal.mock.calls[0][1].headers as Record<string, string>;
    expect(initHeaders.authorization).toBe("Key test-fal-key");
    expect(String(fal.mock.calls[1][0])).toBe("https://upload.example/x");
    expect(fal.mock.calls[1][1].method).toBe("PUT");
  });

  it("refuses uploads larger than 20 MB", async () => {
    const { token } = await setup();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }));

    const res = await SELF.fetch("https://billing.local/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    expect(res.status).toBe(413);
  });

  it("hides jobs owned by other accounts and unknown requests", async () => {
    const { token, jobId } = await setup();
    await db.DB.prepare("INSERT INTO job_calls (request_id, job_id, app, created) VALUES ('req-7', ?, 'fal-ai/ffmpeg-api/metadata', 0)")
      .bind(jobId)
      .run();
    const other = await register("dev-2");

    const crossAccount = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls/req-7/status`, {
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(crossAccount.status).toBe(404);

    const unknownRequest = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls/req-unknown/status`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(unknownRequest.status).toBe(404);
  });
});
