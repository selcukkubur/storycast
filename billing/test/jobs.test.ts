import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

async function register(device = "dev-1") {
  const res = await SELF.fetch("https://billing.local/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device, idfv: `idfv-${device}` }),
  });
  return (await res.json()) as { account: string; token: string };
}

const start = (token: string, minutes: number, resolution = "480P") =>
  SELF.fetch("https://billing.local/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ minutes, resolution }),
  });

async function makeStarter(account: string) {
  await db.DB.prepare("UPDATE accounts SET plan = 'starter', expires_at = 9999999999 WHERE id = ?").bind(account).run();
  await db.DB.prepare("INSERT INTO ledger (pool, kind, credits, ref, created) VALUES (?, 'grant', 2, ?, 0)")
    .bind(account, `grant:extra:${account}`)
    .run();
}

async function grant(account: string, credits: number) {
  await db.DB.prepare("INSERT INTO ledger (pool, kind, credits, ref, created) VALUES (?, 'grant', ?, ?, 0)")
    .bind(account, credits, `grant:test:${account}:${credits}`)
    .run();
}

async function debitCount(pool: string) {
  const row = await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE pool = ? AND kind = 'debit'")
    .bind(pool)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("POST /jobs", () => {
  it("starts a trial film and debits its only credit", async () => {
    const { token } = await register();
    const res = await start(token, 1);
    expect(res.status).toBe(200);
    const b = (await res.json()) as { jobId: string; cost: number; creditsLeft: number; watermark: boolean };
    expect(b.cost).toBe(1);
    expect(b.creditsLeft).toBe(0);
    expect(b.watermark).toBe(true);
  });

  it("refuses a second film when credits are gone", async () => {
    const { token } = await register();
    await start(token, 1);
    const res = await start(token, 1);
    expect(res.status).toBe(402);
  });

  it("refuses a film beyond the plan length cap", async () => {
    const { token, account } = await register();
    await makeStarter(account);
    const res = await start(token, 3);
    expect(res.status).toBe(422);
  });

  it("allows only one running film per pool", async () => {
    const { token, account } = await register();
    await makeStarter(account);
    await start(token, 1);
    const res = await start(token, 1);
    expect(res.status).toBe(409);
  });

  it("rejects unknown resolutions", async () => {
    const { token } = await register();
    const res = await start(token, 1, "1080P");
    expect(res.status).toBe(400);
  });

  it("refuses a film when a running job already exists and debits nothing", async () => {
    const { token, account } = await register();
    await makeStarter(account);
    await db.DB.prepare(
      "INSERT INTO jobs (id, account, pool, minutes, resolution, credits, status, created) VALUES (?, ?, ?, 1, '480P', 1, 'running', 0)",
    )
      .bind("existing-job", account, account)
      .run();

    expect(await debitCount(account)).toBe(0);

    const res = await start(token, 1);
    expect(res.status).toBe(409);
    expect(await debitCount(account)).toBe(0);

    const jobs = await db.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE pool = ?").bind(account).first<{ n: number }>();
    expect(jobs?.n).toBe(1);
  });

  it("charges 2 credits for a 768P film", async () => {
    const { token, account } = await register();
    await makeStarter(account);
    await grant(account, 3);
    expect(await debitCount(account)).toBe(0);

    const res = await start(token, 1, "768P");
    expect(res.status).toBe(200);
    const b = (await res.json()) as { jobId: string; cost: number; creditsLeft: number; watermark: boolean };
    expect(b.cost).toBe(2);
    expect(b.creditsLeft).toBe(4);
    expect(b.watermark).toBe(false);

    const debit = await db.DB.prepare("SELECT credits, job_id FROM ledger WHERE ref = ?")
      .bind(`debit:${b.jobId}`)
      .first<{ credits: number; job_id: string }>();
    expect(debit?.credits).toBe(-2);
    expect(debit?.job_id).toBe(b.jobId);
  });
});
