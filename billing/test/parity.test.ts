import { describe, expect, it } from "vitest";
import { PLANS as serverPlans, creditsFor as serverCredits } from "../src/credits";
import { PLANS as clientPlans, creditsFor as clientCredits } from "../../web/src/lib/studio/plans";

describe("credit parity", () => {
  it("keeps client and server plan tables identical", () => {
    expect(clientPlans).toEqual(serverPlans);
  });
  it("agrees on credit math across the slider range", () => {
    for (const m of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) {
      for (const r of ["480P", "768P"] as const) {
        expect(clientCredits(m, r)).toBe(serverCredits(m, r));
      }
    }
  });
});
