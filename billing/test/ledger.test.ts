import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";
import { balance, record } from "../src/ledger";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls; DROP TABLE IF EXISTS job_assets;");
  // D1's exec() splits on newlines, so the multi-line schema must be collapsed onto one line first.
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

describe("ledger", () => {
  it("records a grant once and ignores duplicate refs", async () => {
    expect(await record(db, "acct1", "grant", 1, "trial:acct1")).toBe(true);
    expect(await record(db, "acct1", "grant", 1, "trial:acct1")).toBe(false);
    expect(await balance(db, "acct1")).toBe(1);
  });

  it("debits with negative credits and refunds back", async () => {
    await record(db, "acct1", "grant", 3, "grant:acct1");
    await record(db, "acct1", "debit", -2, "debit:job1", "job1");
    expect(await balance(db, "acct1")).toBe(1);
    await record(db, "acct1", "refund", 1, "refund:job1", "job1");
    expect(await balance(db, "acct1")).toBe(2);
  });

  it("keeps pools isolated", async () => {
    await record(db, "poolA", "grant", 5, "grant:a");
    await record(db, "poolB", "grant", 2, "grant:b");
    expect(await balance(db, "poolA")).toBe(5);
    expect(await balance(db, "poolB")).toBe(2);
  });
});
