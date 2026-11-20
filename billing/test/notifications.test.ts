import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";
import { createApp } from "../src/index";
import type { Subscription } from "../src/apple";

const db = env as unknown as { DB: D1Database; HASH_SALT: string };
const now = () => Math.floor(Date.now() / 1000);
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let current: Subscription;

const app = createApp({ verifier: { subscription: async () => current } });

const post = (path: string, token: string | null, payload: unknown) =>
  app.fetch(
    new Request(`https://billing.local${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    }),
    db,
  );

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
  current = {
    plan: "starter",
    productId: "com.storycast.starter.monthly",
    expiresAt: now() + 30 * 24 * 3600,
    originalTransactionId: "orig-1",
    appAccountToken: null,
    environment: "Sandbox",
    revoked: false,
  };
});

describe("notifications", () => {
  it("applies a renewal and stays idempotent on redelivery", async () => {
    const acc = await (
      await post("/accounts", null, { device: "dev-1", idfv: "idfv-1" })
    ).json<{ token: string }>();
    await post("/apple/subscription", acc.token, { transactionId: "tx-1" });

    const payload = { signedPayload: `${b64url("{}")}.${b64url(JSON.stringify({ notificationType: "DID_RENEW", data: { transactionId: "tx-1" } }))}.sig` };
    const first = await post("/apple/notifications", null, payload);
    const second = await post("/apple/notifications", null, payload);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const row = await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE ref LIKE 'grant:%'").first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("revokes access on REFUND", async () => {
    const acc = await (
      await post("/accounts", null, { device: "dev-1", idfv: "idfv-1" })
    ).json<{ token: string }>();
    await post("/apple/subscription", acc.token, { transactionId: "tx-1" });
    current = { ...current, revoked: true };

    const payload = { signedPayload: `${b64url("{}")}.${b64url(JSON.stringify({ notificationType: "REFUND", data: { transactionId: "tx-1" } }))}.sig` };
    const res = await post("/apple/notifications", null, payload);
    expect(res.status).toBe(200);

    const wallet = (await (await app.fetch(new Request("https://billing.local/wallet", { headers: { authorization: `Bearer ${acc.token}` } }), db)).json()) as { plan: string };
    expect(wallet.plan).toBe("trial");
  });
});
