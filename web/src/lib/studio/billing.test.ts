import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingActive, billingRun, registerDevice, startFilm } from "./billing";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

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
});
