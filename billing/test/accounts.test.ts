import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

async function register(device = "dev-1", idfv = "idfv-1") {
  const res = await SELF.fetch("https://billing.local/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device, idfv }),
  });
  return { status: res.status, body: (await res.json()) as { account?: string; token?: string; error?: string } };
}

describe("accounts", () => {
  it("registers a device with a one-film trial credit", async () => {
    const r = await register();
    expect(r.status).toBe(200);
    const wallet = await SELF.fetch("https://billing.local/wallet", {
      headers: { authorization: `Bearer ${r.body.token}` },
    });
    const body = (await wallet.json()) as { plan: string; credits: number; maxMinutes: number };
    expect(wallet.status).toBe(200);
    expect(body).toMatchObject({ plan: "trial", credits: 1, maxMinutes: 1 });
  });

  it("refuses a second device registration and never double-grants", async () => {
    await register();
    const again = await register();
    expect(again.status).toBe(409);
    const rows = await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger").first<{ n: number }>();
    expect(rows?.n).toBe(1);
    const accounts = await db.DB.prepare("SELECT COUNT(*) AS n FROM accounts").first<{ n: number }>();
    expect(accounts?.n).toBe(1);
  });

  it("lets a different device register with its own token", async () => {
    const first = await register("dev-1", "idfv-1");
    expect(first.status).toBe(200);
    const second = await register("dev-2", "idfv-2");
    expect(second.status).toBe(200);
    expect(second.body.account).toBeTruthy();
    expect(second.body.token).toBeTruthy();
    expect(second.body.token).not.toBe(first.body.token);
    expect(second.body.account).not.toBe(first.body.account);

    const accounts = await db.DB.prepare("SELECT COUNT(*) AS n FROM accounts").first<{ n: number }>();
    expect(accounts?.n).toBe(2);
    const granted = await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant'").first<{ n: number }>();
    expect(granted?.n).toBe(2);

    const wallet = await SELF.fetch("https://billing.local/wallet", {
      headers: { authorization: `Bearer ${second.body.token}` },
    });
    expect(wallet.status).toBe(200);
    expect((await wallet.json()) as { credits: number }).toMatchObject({ credits: 1 });
  });

  it("rejects missing or bad tokens", async () => {
    const res = await SELF.fetch("https://billing.local/wallet");
    expect(res.status).toBe(401);
    const bad = await SELF.fetch("https://billing.local/wallet", { headers: { authorization: "Bearer nope" } });
    expect(bad.status).toBe(401);
  });
});
