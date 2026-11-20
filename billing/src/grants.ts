import { PLANS, type Plan } from "./credits";
import { balance, record } from "./ledger";

type Db = { DB: D1Database };

export const period = () => new Date().toISOString().slice(0, 7);

export async function grantMonth(env: Db, walletPool: string, plan: Plan) {
  const bal = await balance(env, walletPool);
  const grant = Math.min(PLANS[plan].credits, Math.max(0, PLANS[plan].rolloverCap - bal));
  if (grant > 0) await record(env, walletPool, "grant", grant, `grant:${period()}:${walletPool}`);
}
