import { beforeEach, describe, expect, it, vi } from "vitest";

// The native expo modules are aliased to the node stub in `vitest.config.ts`; its
// store is shared across tests in this file, so each test starts empty.
import { memory } from "../../test/stubs/expo";
import { billingActive, billingRun, devTopUp, ensureDevice, initBilling, settleFilm, startFilm } from "./billing";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  memory.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  process.env.EXPO_PUBLIC_BILLING_API = "https://billing.test";
});


describe("billing client", () => {
  it("registers a device once and keeps the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ token: "tok-1" })));
    await initBilling();
    await ensureDevice("dev", "idfv");
    expect(billingActive()).toBe(true);
    await ensureDevice("dev", "idfv");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("surfaces plan refusals with status and reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => (String(url).endsWith("/accounts") ? json({ token: "t" }) : json({ error: "cap" }, 422))));
    await initBilling();
    await ensureDevice("dev", "idfv");
    await expect(startFilm(5, "480P")).rejects.toMatchObject({ status: 422, reason: "cap" });
  });

  it("fails a call fast when the status route returns 404", async () => {
    const responses = [json({ token: "t" }), json({ jobId: "job-1", cost: 1, creditsLeft: 0, watermark: true }), json({ request_id: "r1" }), json({ error: "gone" }, 404)];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    await initBilling();
    await ensureDevice("dev", "idfv");
    await startFilm(1, "480P");
    await expect(billingRun("fal-ai/ffmpeg-api/metadata", {})).rejects.toMatchObject({ status: 404 });
  });

  it("clears the session on settle 401 without throwing", async () => {
    const responses = [json({ token: "t" }), json({ jobId: "job-1", cost: 1, creditsLeft: 0, watermark: false }), json({ error: "nope" }, 401)];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    await initBilling();
    await ensureDevice("dev", "idfv");
    await startFilm(1, "480P");
    await expect(settleFilm("error")).resolves.toBeTruthy();
    expect(billingActive()).toBe(false);
  });

  it("keeps the job on a failed settle so the caller can retry", async () => {
    const responses = [
      json({ token: "t" }),
      json({ jobId: "job-1", cost: 1, creditsLeft: 0, watermark: false }),
      json({ error: "boom" }, 500),
      json({ refund: 1, creditsLeft: 0 }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    await initBilling();
    await ensureDevice("dev", "idfv");
    await startFilm(1, "480P");
    await expect(settleFilm("done")).resolves.toMatchObject({ ok: false, status: 500 });
    await expect(settleFilm("done")).resolves.toMatchObject({ ok: true, refund: 1 });
  });

  it("sends the dev token header on top-up and returns creditsLeft", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ token: "t", creditsLeft: 7 }));
    vi.stubGlobal("fetch", fetchMock);
    await initBilling();
    await ensureDevice("dev", "idfv");
    await expect(devTopUp(5, "dev-secret")).resolves.toEqual({ creditsLeft: 7 });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe("https://billing.test/dev/credits");
    expect((init?.headers as Record<string, string>)["x-dev-token"]).toBe("dev-secret");
  });
});
