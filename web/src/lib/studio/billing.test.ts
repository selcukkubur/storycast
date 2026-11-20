import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingActive, billingRun, registerDevice, settleFilm, startFilm } from "./billing";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const film = (id: string) => json({ jobId: id, cost: 1, creditsLeft: 0, watermark: true });

describe("billing client", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("registers, starts a film and runs a proxied call to completion", async () => {
    const responses = [
      () => json({ token: "tok-1" }),
      () => json({ jobId: "job-1", cost: 1, creditsLeft: 0, watermark: true }),
      () => json({ request_id: "req-1" }),
      () => json({ status: "COMPLETED" }),
      () => json({ images: [{ url: "https://fal.media/x.png" }] }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!()));

    await registerDevice("dev-1", "idfv-1");
    expect(billingActive()).toBe(true);
    const job = await startFilm(1, "480P");
    expect(job.jobId).toBe("job-1");
    const out = await billingRun<{ images: { url: string }[] }>("openai/gpt-image-2.5/flare/text-to-image", { prompt: "x" });
    expect(out.images[0].url).toBe("https://fal.media/x.png");
  });

  it("surfaces plan refusals with status and reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "cap" }, 422)));
    await expect(startFilm(3, "480P")).rejects.toMatchObject({ status: 422, reason: "cap" });
  });

  it("fails fast when the status route answers 404 instead of polling", async () => {
    const responses = [
      () => json({ token: "tok-2" }),
      () => film("job-2"),
      () => json({ request_id: "req-2" }),
      () => json({ error: "unknown request" }, 404),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!()));

    await registerDevice("dev-2", "idfv-2");
    await startFilm(1, "480P");
    await expect(billingRun("fal-ai/nano-banana-2", { prompt: "x" })).rejects.toMatchObject({ status: 404 });
    expect(responses).toHaveLength(0);
  });

  it("does not throw when settle answers 401", async () => {
    const responses = [
      () => json({ token: "tok-3" }),
      () => film("job-3"),
      () => json({ error: "unauthorized" }, 401),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!()));

    await registerDevice("dev-3", "idfv-3");
    await startFilm(1, "480P");
    await expect(settleFilm("done")).resolves.toBeUndefined();
    expect(billingActive()).toBe(false);
  });
});
