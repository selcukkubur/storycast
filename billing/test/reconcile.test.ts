import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";
import worker from "../src/index";
import type { AppleVerifier, Subscription } from "../src/apple";
import { reconcile } from "../src/reconcile";

const db = env as unknown as { DB: D1Database };
const nowSeconds = () => Math.floor(Date.now() / 1000);

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  plan: "starter",
  productId: "com.storycast.starter.monthly",
  expiresAt: nowSeconds() + 86400,
  originalTransactionId: "tx",
  appAccountToken: null,
  environment: "Sandbox",
  revoked: false,
  ...over,
});

const verifier = (subs: Record<string, Subscription | "throw">): AppleVerifier => ({
  subscription: async (tx) => {
    const s = subs[tx];
    if (!s || s === "throw") throw new Error("unavailable");
    return s;
  },
});

beforeEach(async () => {
  await db.DB.exec(
    "DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls; DROP TABLE IF EXISTS job_assets;",
  );
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

let seq = 0;
async function seed(origTxn: string, plan = "starter", expiresAt = 0) {
  seq += 1;
  const id = `acct-${seq}`;
  await db.DB.prepare(
    "INSERT INTO accounts (id, token_hash, device_hash, idfv_hash, plan, expires_at, orig_txn, created) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
  )
    .bind(id, `tok-${seq}`, `dev-${seq}`, `idfv-${seq}`, plan, expiresAt, origTxn)
    .run();
  return id;
}

const grantRows = async (pool: string) =>
  (await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE pool = ? AND ref LIKE 'grant:%'").bind(pool).first<{ n: number }>())?.n ?? 0;

const accountRow = (id: string) =>
  db.DB.prepare("SELECT plan, expires_at FROM accounts WHERE id = ?").bind(id).first<{ plan: string; expires_at: number }>();

describe("reconcile", () => {
  it("renews an active subscription and re-applies the monthly grant idempotently", async () => {
    const id = await seed("tx-a", "starter", 1000);
    const v = verifier({ "tx-a": sub({ plan: "family" }) });
    expect(await reconcile(db, v)).toEqual({ checked: 1, renewed: 1, downgraded: 0, failed: 0 });
    const row = await accountRow(id);
    expect(row?.plan).toBe("family");
    expect(row!.expires_at).toBeGreaterThan(nowSeconds());
    expect(await grantRows(id)).toBe(1);
    await reconcile(db, v);
    expect(await grantRows(id)).toBe(1);
  });

  it("downgrades a revoked subscription to trial terms without granting", async () => {
    const id = await seed("tx-b", "family", nowSeconds() + 86400);
    expect(await reconcile(db, verifier({ "tx-b": sub({ revoked: true }) }))).toEqual({
      checked: 1,
      renewed: 0,
      downgraded: 1,
      failed: 0,
    });
    expect(await accountRow(id)).toEqual({ plan: "trial", expires_at: 0 });
    expect(await grantRows(id)).toBe(0);
  });

  it("skips accounts without a stored transaction and isolates verifier failures", async () => {
    await seed("", "trial", 0);
    const bad = await seed("tx-bad", "starter", nowSeconds() + 86400);
    const good = await seed("tx-good", "starter", 1);
    expect(await reconcile(db, verifier({ "tx-bad": "throw", "tx-good": sub() }))).toEqual({
      checked: 2,
      renewed: 1,
      downgraded: 0,
      failed: 1,
    });
    expect((await accountRow(bad))?.plan).toBe("starter");
    expect((await accountRow(good))?.plan).toBe("starter");
  });

  it("wires scheduled reconciliation into the default export", () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof worker.scheduled).toBe("function");
  });
});
