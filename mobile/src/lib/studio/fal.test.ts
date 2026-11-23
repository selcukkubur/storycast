import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/billing", () => ({
  BillingError: class BillingError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  billingRun: vi.fn(),
  billingUpload: vi.fn(),
}));

import { BillingError, billingRun, billingUpload } from "@/src/lib/billing";
import { FalError, duration, isKeyError, run, upload } from "./fal";

const billing = vi.mocked(billingRun);
const failed = (status: number) => new BillingError(status, `fal said ${status}`);

describe("fal shim", () => {
  it("turns an expired key into a FalError the caller can recognise", async () => {
    billing.mockRejectedValueOnce(failed(401));
    const e = await run("fal-ai/any", {}).catch((x) => x);
    expect(e).toBeInstanceOf(FalError);
    expect(e.status).toBe(401);
    expect(isKeyError(e)).toBe(true);
  });

  it("keeps a 422 a plain (non-key) FalError", async () => {
    billing.mockRejectedValueOnce(failed(422));
    const e = await run("fal-ai/any", {}).catch((x) => x);
    expect(e).toBeInstanceOf(FalError);
    expect(e.status).toBe(422);
    expect(isKeyError(e)).toBe(false);
  });

  it("rethrows anything that is not a BillingError unchanged", async () => {
    const boom = new Error("socket hang up");
    billing.mockRejectedValueOnce(boom);
    await expect(run("fal-ai/any", {})).rejects.toBe(boom);
    expect(isKeyError(boom)).toBe(false);
  });

  it("reads the duration through the metadata app", async () => {
    billing.mockResolvedValueOnce({ media: { duration: "12.5" } });
    await expect(duration("https://fal.media/a.mp3")).resolves.toBe(Number("12.5"));
    expect(billing).toHaveBeenCalledWith("fal-ai/ffmpeg-api/metadata", { media_url: "https://fal.media/a.mp3" });
  });

  it("uploads through the billing proxy and returns its url", async () => {
    vi.mocked(billingUpload).mockResolvedValueOnce("https://fal.media/wm.png");
    const file = { uri: "file:///wm.png", name: "watermark.png", type: "image/png" };
    await expect(upload(file)).resolves.toBe("https://fal.media/wm.png");
    expect(billingUpload).toHaveBeenCalledWith(file);
  });
});
