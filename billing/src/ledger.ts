import { now } from "./http";

type Db = { DB: D1Database };

export type EntryKind = "grant" | "topup" | "debit" | "refund" | "adjust";

export function recordStmt(db: Db, pool: string, kind: EntryKind, credits: number, ref: string, jobId?: string) {
  return db.DB.prepare(
    "INSERT OR IGNORE INTO ledger (pool, kind, credits, ref, job_id, created) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(pool, kind, credits, ref, jobId ?? null, now());
}

export async function record(db: Db, pool: string, kind: EntryKind, credits: number, ref: string, jobId?: string): Promise<boolean> {
  const r = await recordStmt(db, pool, kind, credits, ref, jobId).run();
  return (r.meta?.changes ?? 0) === 1;
}

export async function balance(db: Db, pool: string): Promise<number> {
  const r = await db.DB.prepare("SELECT COALESCE(SUM(credits), 0) AS b FROM ledger WHERE pool = ?").bind(pool).first<{ b: number }>();
  return r?.b ?? 0;
}
