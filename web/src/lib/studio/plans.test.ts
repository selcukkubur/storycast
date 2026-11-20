import { describe, expect, it } from "vitest";
import { PLANS, creditsFor, previewOutcome } from "./plans";

describe("creditsFor", () => {
  it("matches the server multiplier", () => {
    expect(creditsFor(2, "480P")).toBe(2);
    expect(creditsFor(2, "768P")).toBe(4);
  });
});

describe("previewOutcome", () => {
  it("allows a film the wallet covers", () => {
    expect(previewOutcome("starter", 3, 2, "480P")).toEqual({ ok: true, cost: 2 });
  });
  it("suggests an upgrade past the plan cap", () => {
    expect(previewOutcome("starter", 9, 3, "480P")).toMatchObject({ ok: false, reason: "cap", upgrade: "family" });
    expect(previewOutcome("trial", 9, 2, "480P")).toMatchObject({ ok: false, reason: "cap", upgrade: "starter" });
  });
  it("suggests a top-up when only credits are short", () => {
    expect(previewOutcome("family", 1, 2, "480P")).toMatchObject({ ok: false, reason: "credits", upgrade: null });
    expect(previewOutcome("starter", 1, 1, "768P")).toMatchObject({ ok: false, reason: "credits" });
  });
  it("caps the trial at 480P", () => {
    expect(previewOutcome("trial", 99, 1, "768P")).toMatchObject({ ok: false, reason: "cap", upgrade: "starter" });
    expect(previewOutcome("trial", 1, 1, "480P")).toEqual({ ok: true, cost: 1 });
  });
  it("keeps the plan table in sync with the spec", () => {
    expect(PLANS.starter.credits).toBe(3);
    expect(PLANS.family.maxMinutes).toBe(5);
  });
});
