import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";
import { createApp, type Env } from "../src/index";
import type { Subscription } from "../src/apple";

const db = env as unknown as { DB: D1Database; HASH_SALT: string };
const workerEnv = env as unknown as Env;
const future = () => Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

const ownerSub: Subscription = {
  plan: "family",
  productId: "com.storycast.family.monthly",
  expiresAt: future(),
  originalTransactionId: "orig-fam",
  appAccountToken: "token-fam",
  environment: "Sandbox",
  revoked: false,
};

const app = createApp({ verifier: { subscription: async () => ownerSub } });
const post = (path: string, token: string, payload: unknown) =>
  app.fetch(
    new Request(`https://billing.local${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }),
    workerEnv,
  );
const get = (path: string, token: string) =>
  app.fetch(new Request(`https://billing.local${path}`, { headers: { authorization: `Bearer ${token}` } }), workerEnv);

async function register(device: string) {
  const r = await app.fetch(
    new Request("https://billing.local/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device, idfv: `idfv-${device}` }),
    }),
    workerEnv,
  );
  return (await r.json()) as { account: string; token: string };
}

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

describe("family pool", () => {
  it("links a member to the subscriber's wallet and plan", async () => {
    const owner = await register("owner-dev");
    await post("/apple/subscription", owner.token, { transactionId: "tx-owner" });

    const member = await register("member-dev");
    const res = await post("/apple/subscription", member.token, { transactionId: "tx-owner" });
    expect(res.status).toBe(200);

    const wallet = (await (await get("/wallet", member.token)).json()) as { plan: string; credits: number; maxMinutes: number; familyOf: string };
    expect(wallet.plan).toBe("family");
    expect(wallet.maxMinutes).toBe(5);
    expect(wallet.familyOf).toBe(owner.account);
    expect(wallet.credits).toBe(6);
  });

  it("debits the shared pool from a member's film", async () => {
    const owner = await register("owner-dev");
    await post("/apple/subscription", owner.token, { transactionId: "tx-owner" });
    const member = await register("member-dev");
    await post("/apple/subscription", member.token, { transactionId: "tx-owner" });

    const start = await post("/jobs", member.token, { minutes: 2, resolution: "480P" });
    expect(start.status).toBe(200);
    const ownerWallet = (await (await get("/wallet", owner.token)).json()) as { credits: number };
    expect(ownerWallet.credits).toBe(4);
  });

  it("rejects a receipt that belongs to an unrelated account", async () => {
    const owner = await register("owner-dev");
    await post("/apple/subscription", owner.token, { transactionId: "tx-owner" });
    const other = await register("other-dev");

    const stranger = createApp({
      verifier: { subscription: async () => ({ ...ownerSub, appAccountToken: "token-other" }) },
    });
    const r = await stranger.fetch(
      new Request("https://billing.local/apple/subscription", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${other.token}` },
        body: JSON.stringify({ transactionId: "tx-owner" }),
      }),
      workerEnv,
    );
    expect(r.status).toBe(409);
    const wallet = (await (await get("/wallet", other.token)).json()) as { plan: string; familyOf: string | null };
    expect(wallet.plan).toBe("trial");
    expect(wallet.familyOf).toBeNull();
  });
});
