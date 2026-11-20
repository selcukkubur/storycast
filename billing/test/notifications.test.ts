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

const notify = (notificationType: string, transactionId: string) =>
  post("/apple/notifications", null, {
    signedPayload: `${b64url("{}")}.${b64url(JSON.stringify({ notificationType, data: { transactionId } }))}.sig`,
  });

const register = async () =>
  (await (await post("/accounts", null, { device: "dev-1", idfv: "idfv-1" })).json<{ account: string; token: string }>());

const wallet = async (token: string) =>
  (await app.fetch(new Request("https://billing.local/wallet", { headers: { authorization: `Bearer ${token}` } }), db)).json<{
    plan: string;
    credits: number;
  }>();

const grantRows = async (poolId: string) =>
  (await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE pool = ? AND ref LIKE 'grant:%'").bind(poolId).first<{ n: number }>())?.n ?? 0;

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls; DROP TABLE IF EXISTS job_assets;");
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
  it("applies a renewal to a pre-linked account and stays idempotent on redelivery", async () => {
    // No prior /apple/subscription sync: the account is linked only by the original transaction id
    // already on its row, so any credit delta below comes from the webhook itself.
    const { account, token } = await register();
    await db.DB.prepare("UPDATE accounts SET orig_txn = 'orig-1' WHERE id = ?").bind(account).run();
    expect(await grantRows(account)).toBe(0);
    expect((await wallet(token)).credits).toBe(1);

    const payload = { signedPayload: `${b64url("{}")}.${b64url(JSON.stringify({ notificationType: "DID_RENEW", data: { transactionId: "tx-1" } }))}.sig` };
    const first = await post("/apple/notifications", null, payload);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });

    const applied = await wallet(token);
    expect({ plan: applied.plan, credits: applied.credits }).toEqual({ plan: "starter", credits: 4 });
    expect(await grantRows(account)).toBe(1);

    const second = await post("/apple/notifications", null, payload);
    expect(second.status).toBe(200);

    const replayed = await wallet(token);
    expect({ plan: replayed.plan, credits: replayed.credits }).toEqual({ plan: "starter", credits: 4 });
    expect(await grantRows(account)).toBe(1);
  });

  it("revokes access on a verified REFUND", async () => {
    const { token } = await register();
    await post("/apple/subscription", token, { transactionId: "tx-1" });
    current = { ...current, revoked: true };

    const res = await notify("REFUND", "tx-1");
    expect(res.status).toBe(200);

    expect((await wallet(token)).plan).toBe("trial");
  });

  it("does not let payload text flip state: REFUND claim over an active verified subscription", async () => {
    const { account, token } = await register();
    await db.DB.prepare("UPDATE accounts SET orig_txn = 'orig-1' WHERE id = ?").bind(account).run();
    expect((await notify("DID_RENEW", "tx-1")).status).toBe(200);
    expect((await wallet(token)).plan).toBe("starter");

    // `current` is still active and non-revoked, so the claimed type must not revoke anything.
    const res = await notify("REFUND", "tx-1");
    expect(res.status).toBe(200);

    const after = await wallet(token);
    expect(after.plan).toBe("starter");
    expect(after.credits).toBe(4);
  });

  it("ignores a consumable receipt instead of downgrading the subscription", async () => {
    const { account, token } = await register();
    await post("/apple/subscription", token, { transactionId: "tx-1" });
    expect((await wallet(token)).plan).toBe("starter");
    const grants = await grantRows(account);

    // The verifier reports a top-up (consumable) receipt as plan "trial" with no expiry.
    current = { ...current, plan: "trial", productId: "com.storycast.topup.3", expiresAt: 0 };
    const res = await notify("DID_RENEW", "tx-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const after = await wallet(token);
    expect({ plan: after.plan, credits: after.credits }).toEqual({ plan: "starter", credits: 4 });
    expect(await grantRows(account)).toBe(grants);
  });

  it("rejects a malformed signedPayload", async () => {
    for (const signedPayload of [
      "garbage",
      `${b64url("{}")}.!!!not-base64!!!.sig`,
      `${b64url("{}")}.${b64url("not json")}.sig`,
    ]) {
      const res = await post("/apple/notifications", null, { signedPayload });
      expect(res.status).toBe(400);
    }
  });
});
