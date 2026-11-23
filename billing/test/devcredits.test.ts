import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";
import { createApp, type Env } from "../src/index";

const db = env as unknown as { DB: D1Database };
const workerEnv = env as unknown as Env;

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls; DROP TABLE IF EXISTS job_assets;");
  await db.DB.exec(schema.replace(/\s+/g, " "));
});

async function account(app: ReturnType<typeof createApp>) {
  const r = await app.fetch(
    new Request("https://billing.local/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: "dev-1", idfv: "idfv-1" }),
    }),
    workerEnv,
  );
  return (await r.json()) as { token: string };
}

const topUp = (
  app: ReturnType<typeof createApp>,
  token: string | null,
  devToken: string | null,
  credits = 3,
  requestEnv: Env = workerEnv,
) =>
  app.fetch(
    new Request("https://billing.local/dev/credits", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(devToken ? { "x-dev-token": devToken } : {}),
      },
      body: JSON.stringify({ credits }),
    }),
    requestEnv,
  );

const wallet = (app: ReturnType<typeof createApp>, token: string) =>
  app.fetch(
    new Request("https://billing.local/wallet", { headers: { authorization: `Bearer ${token}` } }),
    workerEnv,
  );

describe("dev credits", () => {
  it("is disabled when no token is configured", async () => {
    const app = createApp();
    const { token } = await account(app);
    const res = await topUp(app, token, "anything");
    expect(res.status).toBe(404);
  });

  it("requires the matching header", async () => {
    const app = createApp({ devToken: "s3cret" });
    const { token } = await account(app);
    expect((await topUp(app, token, "wrong")).status).toBe(404);
    const ok = await topUp(app, token, "s3cret", 3);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { creditsLeft: number }).creditsLeft).toBe(4); // trial 1 + 3
  });

  it("caps a single grant at 10 credits", async () => {
    const app = createApp({ devToken: "s3cret" });
    const { token } = await account(app);
    const res = await topUp(app, token, "s3cret", 99);
    expect(((await res.json()) as { creditsLeft: number }).creditsLeft).toBe(11); // trial 1 + capped 10
  });

  it("activates from DEV_CREDITS_TOKEN in the environment", async () => {
    const app = createApp(); // no devToken dep: the runbook path is the env binding
    const { token } = await account(app);
    const envWithToken = { ...(env as unknown as Env), DEV_CREDITS_TOKEN: "env-secret" };

    const ok = await topUp(app, token, "env-secret", 3, envWithToken);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { creditsLeft: number }).creditsLeft).toBe(4); // trial 1 + 3

    expect((await topUp(app, token, "wrong", 3, envWithToken)).status).toBe(404);
  });

  it("rejects a valid dev token without a bearer token and leaves the wallet untouched", async () => {
    const app = createApp({ devToken: "s3cret" });
    const { token } = await account(app);

    // The token gate passes, then auth fails: the ordering must still refuse the grant.
    expect((await topUp(app, null, "s3cret", 5)).status).toBe(401);

    const w = await wallet(app, token);
    expect(w.status).toBe(200);
    expect(((await w.json()) as { credits: number }).credits).toBe(1); // trial only
  });
});
