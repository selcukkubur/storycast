import { describe, expect, it, vi } from "vitest";

// `director` -> `fal` -> `billing` pulls in native expo modules; node-only vitest
// cannot load them, so stub them the same way `billing.test.ts` does.
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
vi.mock("expo-application", () => ({ getIosIdForVendorAsync: async () => "idfv-test" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "device-uuid-test" }));

import { DIRECTOR_MODEL, shape, words } from "./director";

describe("director helpers", () => {
  it("uses the managed director model", () => {
    expect(DIRECTOR_MODEL).toBe("anthropic/claude-opus-5.5");
  });

  it("shape grows block count with minutes and keeps talking blocks few", () => {
    const [n1, t1] = shape(1);
    const [n5, t5] = shape(5);
    expect(n1).toBeGreaterThan(0);
    expect(n5).toBeGreaterThan(n1);
    expect(t1).toBeLessThanOrEqual(n1);
    expect(t5).toBeLessThanOrEqual(n5);
  });

  it("words returns monotonic ranges", () => {
    const w1 = words(1);
    const w5 = words(5);
    expect(w1.length).toBeGreaterThan(0);
    expect(Number(w5[0].split("-")[0])).toBeGreaterThan(Number(w1[0].split("-")[0]));
  });
});
