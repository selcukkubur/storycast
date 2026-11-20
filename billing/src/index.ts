import { authenticate, createAccount, planOf, pool } from "./accounts";
import { PLANS, canStart, type Resolution } from "./credits";
import { HttpError, json, num, now, randomId, str } from "./http";
import { balance, record } from "./ledger";

export interface Env {
  DB: D1Database;
  FAL_KEY?: string;
  HASH_SALT: string;
  APPLE_ENVIRONMENT?: string;
  APPLE_ISSUER?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_BUNDLE_ID?: string;
  ACCOUNT_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

const body = async (req: Request) => {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid json");
  }
};

export function createApp() {
  return {
    async fetch(req: Request, env: Env): Promise<Response> {
      try {
        const url = new URL(req.url);
        const path = url.pathname;

        if (req.method === "GET" && path === "/health") return json({ ok: true });

        if (req.method === "POST" && path === "/accounts") {
          const b = await body(req);
          const device = str(b.device, 200);
          if (!device) throw new HttpError(400, "device is required");
          return json(await createAccount(env, device, str(b.idfv, 200)));
        }

        if (req.method === "GET" && path === "/wallet") {
          const account = await authenticate(env, req);
          const plan = planOf(account);
          return json({
            plan,
            credits: await balance(env, pool(account)),
            maxMinutes: PLANS[plan].maxMinutes,
            familyOf: account.family_of,
            expiresAt: account.expires_at,
          });
        }

        if (req.method === "POST" && path === "/jobs") {
          const account = await authenticate(env, req);
          const b = await body(req);
          const minutes = Math.round(num(b.minutes));
          const resolution = str(b.resolution, 8);
          if (minutes < 1 || minutes > 10) throw new HttpError(400, "minutes out of range");
          if (resolution !== "480P" && resolution !== "768P") throw new HttpError(400, "unknown resolution");

          const plan = planOf(account);
          const walletPool = pool(account);
          const credits = await balance(env, walletPool);
          const check = canStart(plan, credits, minutes, resolution as Resolution);
          if (!check.ok) throw new HttpError(check.reason === "cap" ? 422 : 402, check.reason);

          const running = await env.DB.prepare("SELECT id FROM jobs WHERE pool = ? AND status = 'running' LIMIT 1")
            .bind(walletPool)
            .first<{ id: string }>();
          if (running) throw new HttpError(409, "a film is already in production");

          const jobId = randomId(12);
          await record(env, walletPool, "debit", -check.cost, `debit:${jobId}`, jobId);
          await env.DB.prepare(
            "INSERT INTO jobs (id, account, pool, minutes, resolution, credits, status, created) VALUES (?, ?, ?, ?, ?, ?, 'running', ?)",
          )
            .bind(jobId, account.id, walletPool, minutes, resolution, check.cost, now())
            .run();
          return json({ jobId, cost: check.cost, creditsLeft: credits - check.cost, watermark: plan === "trial" });
        }

        throw new HttpError(404, "not found");
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        console.error(e);
        return json({ error: "internal error" }, 500);
      }
    },
  };
}

export default createApp();
