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

// The member's own Starter purchase: a different appAccountToken and originalTransactionId.
const memberSub: Subscription = {
  plan: "starter",
  productId: "com.storycast.starter.monthly",
  expiresAt: future(),
  originalTransactionId: "orig-member",
  appAccountToken: "token-member",
  environment: "Sandbox",
  revoked: false,
};

const subs = new Map<string, Subscription>([["tx-owner", ownerSub]]);
const app = createApp({ verifier: { subscription: async (transactionId) => subs.get(transactionId) ?? ownerSub } });
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
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls; DROP TABLE IF EXISTS job_assets;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
  subs.clear();
  subs.set("tx-owner", ownerSub);
});

describe("family pool", () => {
  it("links a member to the subscriber's wallet and plan", async () => {
    const owner = await register("owner-dev");
    await post("/apple/subscription", owner.token, { transactionId: "tx-owner" });

    const member = await register("member-dev");
    const res = await post("/apple/subscription", member.token, { transactionId: "tx-owner" });
    expect(res.status).toBe(200);

    const wallet = (await (await get("/wallet", member.token)).json()) as {
      plan: string;
      credits: number;
      maxMinutes: number;
      familyOf: string;
      expiresAt: number;
    };
    expect(wallet.plan).toBe("family");
    expect(wallet.maxMinutes).toBe(5);
    expect(wallet.familyOf).toBe(owner.account);
    expect(wallet.credits).toBe(6);
    // A member sees the family subscription's expiry, not its own empty one.
    expect(wallet.expiresAt).toBe(ownerSub.expiresAt);
  });

  it("credits a member's top-up to the pool the member spends from", async () => {
    const owner = await register("owner-dev");
    await post("/apple/subscription", owner.token, { transactionId: "tx-owner" });
    const member = await register("member-dev");
    await post("/apple/subscription", member.token, { transactionId: "tx-owner" });

    subs.set("tx-topup", {
      ...ownerSub,
      productId: "com.storycast.topup.3",
      plan: "starter",
      appAccountToken: null,
      originalTransactionId: "orig-topup",
    });
    const res = await post("/apple/topup", member.token, { transactionId: "tx-topup" });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { creditsAdded: number; creditsLeft: number };
    expect(b.creditsAdded).toBe(3);
    // A top-up credits the pool the member spends from: the owner's pool, not the member's own wallet.
    expect(b.creditsLeft).toBe(9);

    const sharedPool = await db.DB.prepare("SELECT COALESCE(SUM(credits), 0) AS b FROM ledger WHERE pool = ?")
      .bind(owner.account)
      .first<{ b: number }>();
    expect(sharedPool?.b).toBe(9);
    const ownWallet = await db.DB.prepare("SELECT COALESCE(SUM(credits), 0) AS b FROM ledger WHERE pool = ?")
      .bind(member.account)
      .first<{ b: number }>();
    // The member's own wallet keeps only its untouched registration grant.
    expect(ownWallet?.b).toBe(1);

    // Both wallets read the shared pool, so the owner and the member see the bought credits.
    const ownerWallet = (await (await get("/wallet", owner.token)).json()) as { credits: number };
    expect(ownerWallet.credits).toBe(9);
    const memberWallet = (await (await get("/wallet", member.token)).json()) as { credits: number };
    expect(memberWallet.credits).toBe(9);
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

  it("unlinks a member who activates a subscription of their own", async () => {
    const owner = await register("owner-dev");
    await post("/apple/subscription", owner.token, { transactionId: "tx-owner" });
    const member = await register("member-dev");
    await post("/apple/subscription", member.token, { transactionId: "tx-owner" });

    const linked = (await (await get("/wallet", member.token)).json()) as { familyOf: string | null; credits: number };
    expect(linked.familyOf).toBe(owner.account);
    expect(linked.credits).toBe(6);

    subs.set("tx-member", memberSub);
    const res = await post("/apple/subscription", member.token, { transactionId: "tx-member" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: string; credits: number };
    expect(body.plan).toBe("starter");
    expect(body.credits).toBe(4);

    const wallet = (await (await get("/wallet", member.token)).json()) as {
      plan: string;
      credits: number;
      maxMinutes: number;
      familyOf: string | null;
      expiresAt: number;
    };
    expect(wallet.plan).toBe("starter");
    expect(wallet.credits).toBe(4);
    expect(wallet.maxMinutes).toBe(2);
    expect(wallet.familyOf).toBeNull();
    expect(wallet.expiresAt).toBe(memberSub.expiresAt);

    const ownerWallet = (await (await get("/wallet", owner.token)).json()) as { plan: string; credits: number };
    expect(ownerWallet.plan).toBe("family");
    expect(ownerWallet.credits).toBe(6);
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
