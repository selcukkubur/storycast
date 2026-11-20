export type Plan = "trial" | "starter" | "family";
export type Resolution = "480P" | "768P";

export const PLANS: Record<Plan, { credits: number; maxMinutes: number; rolloverCap: number }> = {
  trial: { credits: 1, maxMinutes: 1, rolloverCap: 0 },
  starter: { credits: 3, maxMinutes: 2, rolloverCap: 6 },
  family: { credits: 5, maxMinutes: 5, rolloverCap: 10 },
};

export const multiplier = (res: Resolution) => (res === "768P" ? 2 : 1);
export const creditsFor = (minutes: number, res: Resolution) => Math.ceil(minutes * multiplier(res));

export type PlanOutcome =
  | { ok: true; cost: number }
  | { ok: false; reason: "cap" | "credits"; cost: number; upgrade: Plan | null };

export function previewOutcome(plan: Plan, credits: number, minutes: number, res: Resolution): PlanOutcome {
  const cost = creditsFor(minutes, res);
  if (minutes > PLANS[plan].maxMinutes)
    return { ok: false, reason: "cap", cost, upgrade: plan === "trial" ? "starter" : plan === "starter" ? "family" : null };
  if (credits < cost) return { ok: false, reason: "credits", cost, upgrade: plan === "trial" ? "starter" : null };
  return { ok: true, cost };
}
