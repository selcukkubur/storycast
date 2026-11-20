export type Plan = "trial" | "starter" | "family";
export type Resolution = "480P" | "768P";

export const PLANS: Record<Plan, { credits: number; maxMinutes: number; rolloverCap: number }> = {
  trial: { credits: 1, maxMinutes: 1, rolloverCap: 0 },
  starter: { credits: 3, maxMinutes: 2, rolloverCap: 6 },
  family: { credits: 5, maxMinutes: 5, rolloverCap: 10 },
};

export const multiplier = (res: Resolution) => (res === "768P" ? 2 : 1);

export const creditsFor = (minutes: number, res: Resolution) => Math.ceil(minutes * multiplier(res));

export type StartCheck = { ok: true; cost: number } | { ok: false; reason: "cap" | "credits"; cost: number };

export function canStart(plan: Plan, balance: number, minutes: number, res: Resolution): StartCheck {
  const cost = creditsFor(minutes, res);
  if (plan === "trial" && res !== "480P") return { ok: false, reason: "cap", cost };
  if (minutes > PLANS[plan].maxMinutes) return { ok: false, reason: "cap", cost };
  if (balance < cost) return { ok: false, reason: "credits", cost };
  return { ok: true, cost };
}

export function settleRefund(plannedMinutes: number, res: Resolution, actualSeconds: number): number {
  const planned = creditsFor(plannedMinutes, res);
  if (actualSeconds >= plannedMinutes * 60 * 0.9) return 0;
  return Math.max(0, planned - creditsFor(Math.ceil(actualSeconds) / 60, res));
}
