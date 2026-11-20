import { describe, expect, it } from "vitest";
import { PLANS, canStart, creditsFor, settleRefund } from "../src/credits";

describe("creditsFor", () => {
  it("charges 1 credit per minute at 480P", () => {
    expect(creditsFor(1, "480P")).toBe(1);
    expect(creditsFor(3, "480P")).toBe(3);
  });
  it("charges 2 credits per minute at 768P", () => {
    expect(creditsFor(1, "768P")).toBe(2);
    expect(creditsFor(2.5, "768P")).toBe(5);
  });
});

describe("canStart", () => {
  it("allows a plan-capped film when the balance covers it", () => {
    expect(canStart("starter", 3, 2, "480P")).toEqual({ ok: true, cost: 2 });
  });
  it("rejects films beyond the plan length cap", () => {
    expect(canStart("starter", 99, 3, "480P")).toEqual({ ok: false, reason: "cap", cost: 3 });
    expect(canStart("trial", 99, 2, "480P").ok).toBe(false);
  });
  it("rejects a 768P film the trial cannot pay for", () => {
    expect(canStart("trial", 1, 1, "768P")).toEqual({ ok: false, reason: "credits", cost: 2 });
  });
  it("uses the family cap of 5 minutes", () => {
    expect(canStart("family", 5, 5, "480P")).toEqual({ ok: true, cost: 5 });
    expect(canStart("family", 10, 6, "480P")).toEqual({ ok: false, reason: "cap", cost: 6 });
  });
});

describe("settleRefund", () => {
  it("refunds nothing when the film is close to plan", () => {
    expect(settleRefund(1, "480P", 60)).toBe(0);
    expect(settleRefund(3, "480P", 165)).toBe(0);
  });
  it("refunds whole credits for a much shorter film", () => {
    // 30s of a 1-minute 480P film still costs the single credit (ceil), so nothing is refundable.
    expect(settleRefund(1, "480P", 30)).toBe(0);
    expect(settleRefund(1, "768P", 30)).toBe(1);
    expect(settleRefund(3, "480P", 90)).toBe(1);
  });
});

describe("PLANS", () => {
  it("matches the approved spec", () => {
    expect(PLANS).toEqual({
      trial: { credits: 1, maxMinutes: 1, rolloverCap: 0 },
      starter: { credits: 3, maxMinutes: 2, rolloverCap: 6 },
      family: { credits: 5, maxMinutes: 5, rolloverCap: 10 },
    });
  });
});
