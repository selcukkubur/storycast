import { beforeEach, describe, expect, it, vi } from "vitest";

const secure = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => secure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void secure.set(k, v),
  deleteItemAsync: async (k: string) => void secure.delete(k),
}));
vi.mock("expo-application", () => ({ getIosIdForVendorAsync: async () => "idfv-test" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "device-uuid-test" }));

import { billingActive, billingRun, ensureDevice, initBilling, settleFilm, startFilm } from "./billing";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  secure.clear();
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
});
