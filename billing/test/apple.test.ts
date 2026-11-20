import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";
import { createApp, type Env } from "../src/index";
import type { AppleVerifier, Subscription } from "../src/apple";

const db = env as unknown as Env;

const future = () => Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

function fakeApp(subs: Record<string, Subscription>) {
  const verifier: AppleVerifier = { subscription: async (tx) => subs[tx] };
  return createApp({ verifier });
}

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  plan: "starter",
  productId: "com.storycast.starter.monthly",
  expiresAt: future(),
  originalTransactionId: "orig-1",
  appAccountToken: null,
  environment: "Sandbox",
  revoked: false,
  ...over,
});

async function register(app: ReturnType<typeof fakeApp>) {
  const r = await app.fetch(
    new Request("https://billing.local/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: "dev-1", idfv: "idfv-1" }),
    }),
    db,
  );
  return (await r.json()) as { account: string; token: string };
}

const post = (app: ReturnType<typeof fakeApp>, path: string, token: string, payload: unknown, method = "POST") =>
  app.fetch(
    new Request(`https://billing.local${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }),
    db,
  );

const wallet = async (app: ReturnType<typeof fakeApp>, token: string) => {
  const r = await app.fetch(new Request("https://billing.local/wallet", { headers: { authorization: `Bearer ${token}` } }), db);
  return (await r.json()) as { plan: string; credits: number };
};

const grantRows = async (poolId: string) => {
  const r = await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE pool = ? AND kind = 'grant'").bind(poolId).first<{ n: number }>();
  return r?.n ?? 0;
};

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

describe("apple subscription sync", () => {
  it("activates the plan and grants one month of credits", async () => {
    const app = fakeApp({ tx1: sub() });
    const { token } = await register(app);
    const res = await post(app, "/apple/subscription", token, { transactionId: "tx1" });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { plan: string; credits: number };
    expect(b.plan).toBe("starter");
    expect(b.credits).toBe(4);
  });

  it("never double-grants within the same month", async () => {
    const app = fakeApp({ tx1: sub() });
    const { token } = await register(app);
    await post(app, "/apple/subscription", token, { transactionId: "tx1" });
    const again = (await (await post(app, "/apple/subscription", token, { transactionId: "tx1" })).json()) as { credits: number };
    expect(again.credits).toBe(4);
  });

  it("falls back to trial terms when the subscription has expired", async () => {
    const app = fakeApp({ tx1: sub({ expiresAt: 1000 }) });
    const { token } = await register(app);
    const b = (await (await post(app, "/apple/subscription", token, { transactionId: "tx1" })).json()) as { plan: string };
    expect(b.plan).toBe("trial");
  });

  it("revokes a mid-term subscription back to trial without another grant", async () => {
    const subs: Record<string, Subscription> = { tx1: sub() };
    const app = fakeApp(subs);
    const { token, account } = await register(app);
    await post(app, "/apple/subscription", token, { transactionId: "tx1" });
    expect((await wallet(app, token)).plan).toBe("starter");
    const before = await grantRows(account);

    subs.tx1 = sub({ revoked: true });
    const res = await post(app, "/apple/subscription", token, { transactionId: "tx1" });
    expect(((await res.json()) as { plan: string }).plan).toBe("trial");

    const after = await wallet(app, token);
    expect(after.plan).toBe("trial");
    expect(await grantRows(account)).toBe(before);
  });

  it("rejects a missing or empty transaction id", async () => {
    const app = fakeApp({});
    const { token } = await register(app);
    for (const path of ["/apple/subscription", "/apple/topup"]) {
      expect((await post(app, path, token, {})).status).toBe(400);
      expect((await post(app, path, token, { transactionId: "" })).status).toBe(400);
      expect((await post(app, path, token, { transactionId: 42 })).status).toBe(400);
    }
  });
});

describe("top-ups", () => {
  it("adds consumable credits for the matching product", async () => {
    const app = fakeApp({ tx2: sub({ productId: "com.storycast.topup.3" }) });
    const { token } = await register(app);
    const res = await post(app, "/apple/topup", token, { transactionId: "tx2" });
    const b = (await res.json()) as { creditsAdded: number; creditsLeft: number };
    expect(b.creditsAdded).toBe(3);
    expect(b.creditsLeft).toBe(4);
  });

  it("rejects a subscription product sent to the top-up route", async () => {
    const app = fakeApp({ tx3: sub() });
    const { token } = await register(app);
    const res = await post(app, "/apple/topup", token, { transactionId: "tx3" });
    expect(res.status).toBe(400);
  });

  it("rejects a revoked top-up purchase", async () => {
    const app = fakeApp({ tx4: sub({ productId: "com.storycast.topup.3", revoked: true }) });
    const { token } = await register(app);
    const res = await post(app, "/apple/topup", token, { transactionId: "tx4" });
    expect(res.status).toBe(402);
    expect((await wallet(app, token)).credits).toBe(1);
  });

  it("grants nothing when the same top-up is replayed", async () => {
    const app = fakeApp({ tx5: sub({ productId: "com.storycast.topup.1", originalTransactionId: "orig-topup" }) });
    const { token } = await register(app);
    const first = (await (await post(app, "/apple/topup", token, { transactionId: "tx5" })).json()) as {
      creditsAdded: number;
      creditsLeft: number;
    };
    expect(first.creditsAdded).toBe(1);
    expect(first.creditsLeft).toBe(2);

    const second = (await (await post(app, "/apple/topup", token, { transactionId: "tx5" })).json()) as {
      creditsAdded: number;
      creditsLeft: number;
    };
    expect(second.creditsAdded).toBe(0);
    expect(second.creditsLeft).toBe(2);
  });
});
