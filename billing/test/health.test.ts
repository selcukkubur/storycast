import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("health", () => {
  it("answers ok", async () => {
    const res = await SELF.fetch("https://billing.local/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers 404 for unknown routes", async () => {
    const res = await SELF.fetch("https://billing.local/nope");
    expect(res.status).toBe(404);
  });
});
