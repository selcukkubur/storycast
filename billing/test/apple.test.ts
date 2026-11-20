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
});
