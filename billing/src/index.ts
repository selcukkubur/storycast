import { authenticate, createAccount, planOf, pool } from "./accounts";
import { PLANS, canStart, type Resolution } from "./credits";
import { HttpError, json, num, now, randomId, str } from "./http";
import { balance } from "./ledger";
import { ALLOWED_APPS, falResult, falStatus, falSubmit, falUpload } from "./proxy";

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

          const jobId = randomId(12);
          const [created] = await env.DB.batch([
            env.DB.prepare(
              "INSERT INTO jobs (id, account, pool, minutes, resolution, credits, status, created) SELECT ?, ?, ?, ?, ?, ?, 'running', ? WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE pool = ? AND status = 'running')",
            ).bind(jobId, account.id, walletPool, minutes, resolution, check.cost, now(), walletPool),
            env.DB.prepare(
              "INSERT INTO ledger (pool, kind, credits, ref, job_id, created) SELECT ?, 'debit', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM jobs WHERE id = ?)",
            ).bind(walletPool, -check.cost, `debit:${jobId}`, jobId, now(), jobId),
          ]);

          if ((created?.meta?.changes ?? 0) === 0) throw new HttpError(409, "a film is already in production");
          return json({ jobId, cost: check.cost, creditsLeft: credits - check.cost, watermark: plan === "trial" });
        }

        const calls = path.match(/^\/jobs\/([A-Za-z0-9]+)\/calls$/);
        if (req.method === "POST" && calls) {
          const account = await authenticate(env, req);
          const job = await env.DB.prepare("SELECT id, account, status FROM jobs WHERE id = ?")
            .bind(calls[1])
            .first<{ id: string; account: string; status: string }>();
          if (!job || job.account !== account.id) throw new HttpError(404, "job not found");
          if (job.status !== "running") throw new HttpError(409, "job is not running");
          const b = await body(req);
          const app = str(b.app, 100);
          if (!ALLOWED_APPS.has(app)) throw new HttpError(403, "app not allowed");
          if (env.ACCOUNT_LIMIT) {
            const { success } = await env.ACCOUNT_LIMIT.limit({ key: account.id });
            if (!success) throw new HttpError(429, "slow down");
          }
          const r = await falSubmit(env, app, (b.input ?? {}) as Record<string, unknown>);
          await env.DB.prepare("INSERT INTO job_calls (request_id, job_id, app, created) VALUES (?, ?, ?, ?)")
            .bind(r.request_id, job.id, app, now())
            .run();
          return json(r);
        }

        const call = path.match(/^\/jobs\/([A-Za-z0-9]+)\/calls\/([A-Za-z0-9-]+)\/(status|result)$/);
        if (req.method === "GET" && call) {
          const account = await authenticate(env, req);
          const job = await env.DB.prepare("SELECT id, account FROM jobs WHERE id = ?")
            .bind(call[1])
            .first<{ id: string; account: string }>();
          if (!job || job.account !== account.id) throw new HttpError(404, "job not found");
          const row = await env.DB.prepare("SELECT app FROM job_calls WHERE request_id = ? AND job_id = ?")
            .bind(call[2], job.id)
            .first<{ app: string }>();
          if (!row) throw new HttpError(404, "request not found");
          return json(call[3] === "status" ? await falStatus(env, row.app, call[2]) : await falResult(env, row.app, call[2]));
        }

        if (req.method === "POST" && path === "/upload") {
          const account = await authenticate(env, req);
          if (env.ACCOUNT_LIMIT) {
            const { success } = await env.ACCOUNT_LIMIT.limit({ key: account.id });
            if (!success) throw new HttpError(429, "slow down");
          }
          const form = await req.formData();
          const file = form.get("file");
          if (!(file instanceof File)) throw new HttpError(400, "file is required");
          if (file.size > 20 * 1024 * 1024) throw new HttpError(413, "file is larger than 20 MB");
          return json(await falUpload(env, file));
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
