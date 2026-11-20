import { PLANS, type Plan } from "./credits";
import { HttpError, now, randomId, sha256, str } from "./http";
import { recordStmt } from "./ledger";

type Db = { DB: D1Database; HASH_SALT: string };

export type Account = {
  id: string;
  plan: Plan;
  expires_at: number;
  apple_token: string | null;
  orig_txn: string;
  family_of: string | null;
  created: number;
};

export const pool = (account: Account) => account.family_of ?? account.id;

export const planOf = (account: Account): Plan =>
  account.plan === "trial" || account.expires_at > now() ? account.plan : "trial";

export async function createAccount(env: Db, device: string, idfv: string) {
  const deviceHash = await sha256(`${env.HASH_SALT}|d|${str(device, 200)}`);
  const idfvHash = await sha256(`${env.HASH_SALT}|i|${str(idfv, 200)}`);

  const id = randomId(12);
  const token = randomId(40);
  const [created] = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO accounts (id, token_hash, device_hash, idfv_hash, plan, created) SELECT ?, ?, ?, ?, 'trial', ? WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE device_hash = ?)",
    ).bind(id, await sha256(token), deviceHash, idfvHash, now(), deviceHash),
    recordStmt(env, id, "grant", PLANS.trial.credits, `trial:${deviceHash}`),
  ]);

  if ((created?.meta?.changes ?? 0) === 0) throw new HttpError(409, "this device is already registered");
  return { account: id, token };
}

export async function authenticate(env: Db, req: Request): Promise<Account> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "missing token");
  const row = await env.DB.prepare(
    "SELECT id, plan, expires_at, apple_token, orig_txn, family_of, created FROM accounts WHERE token_hash = ?",
  )
    .bind(await sha256(token))
    .first<Account>();
  if (!row) throw new HttpError(401, "bad token");
  return row;
}
