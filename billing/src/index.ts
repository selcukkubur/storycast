import { authenticate, createAccount, effective, pool } from "./accounts";
import { PRODUCTS, serverApiVerifier, type AppleVerifier } from "./apple";
import { PLANS, canStart, settleRefund, type Plan, type Resolution } from "./credits";
import { HttpError, falUrl, json, num, now, randomId, str } from "./http";
import { balance, record } from "./ledger";
import { ALLOWED_APPS, falMetadata, falResult, falStatus, falSubmit, falUpload } from "./proxy";

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

const period = () => new Date().toISOString().slice(0, 7);

async function grantMonth(env: Env, walletPool: string, plan: Plan) {
  const bal = await balance(env, walletPool);
  const grant = Math.min(PLANS[plan].credits, Math.max(0, PLANS[plan].rolloverCap - bal));
  if (grant > 0) await record(env, walletPool, "grant", grant, `grant:${period()}:${walletPool}`);
}

export type Deps = { verifier?: AppleVerifier };

export function createApp(deps: Deps = {}) {
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
          const { plan, walletPool } = await effective(env, account);
          return json({
            plan,
            credits: await balance(env, walletPool),
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

          const { plan, walletPool } = await effective(env, account);
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

        const settlePath = path.match(/^\/jobs\/([A-Za-z0-9]+)\/settle$/);
        if (req.method === "POST" && settlePath) {
          const account = await authenticate(env, req);
          const job = await env.DB.prepare("SELECT id, account, pool, minutes, resolution, credits, settled FROM jobs WHERE id = ?")
            .bind(settlePath[1])
            .first<{ id: string; account: string; pool: string; minutes: number; resolution: Resolution; credits: number; settled: number }>();
          if (!job || job.account !== account.id) throw new HttpError(404, "job not found");
          if (job.settled) return json({ refund: 0, creditsLeft: await balance(env, job.pool), already: true });

          const b = await body(req);
          const outcome = str(b.outcome, 10);
          let refund = 0;
          let videoUrl: string | null = null;

          if (outcome === "error") {
            refund = job.credits;
          } else if (outcome === "done") {
            videoUrl = falUrl(b.videoUrl);
            if (!videoUrl) throw new HttpError(400, "videoUrl must be a fal media URL");
            const { duration } = await falMetadata(env, videoUrl);
            refund = settleRefund(job.minutes, job.resolution, duration);
          } else {
            throw new HttpError(400, "outcome must be done or error");
          }

          if (refund > 0) await record(env, job.pool, "refund", refund, `refund:${job.id}`, job.id);
          await env.DB.prepare("UPDATE jobs SET status = ?, settled = 1, video_url = ? WHERE id = ? AND settled = 0")
            .bind(outcome, videoUrl, job.id)
            .run();
          return json({ refund, creditsLeft: await balance(env, job.pool) });
        }

        if (req.method === "POST" && path === "/apple/subscription") {
          const account = await authenticate(env, req);
          const b = await body(req);
          const transactionId = str(b.transactionId, 100);
          if (!transactionId) throw new HttpError(400, "transactionId is required");
          const verifier = deps.verifier ?? serverApiVerifier(env);
          const sub = await verifier.subscription(transactionId);
          if (!PRODUCTS[sub.productId]?.plan) throw new HttpError(400, "not a subscription product");
          const active = !sub.revoked && sub.expiresAt > now();

          // A receipt may only be claimed by the account it was issued for, except under Family Sharing:
          // a member presenting the subscriber's receipt is linked as `family_of` instead of getting a 409.
          if (sub.appAccountToken) {
            const owner = await env.DB.prepare("SELECT id, plan, expires_at FROM accounts WHERE apple_token = ? AND id != ?")
              .bind(sub.appAccountToken, account.id)
              .first<{ id: string; plan: Plan; expires_at: number }>();
            if (owner && active) {
              await env.DB.prepare("UPDATE accounts SET family_of = ? WHERE id = ?").bind(owner.id, account.id).run();
              await grantMonth(env, owner.id, owner.plan === "trial" ? sub.plan : owner.plan);
              return json({ plan: owner.plan === "trial" ? sub.plan : owner.plan, credits: await balance(env, owner.id), expiresAt: owner.expires_at });
            }
            if (owner) throw new HttpError(409, "receipt is linked to another account");
          }
          if (sub.originalTransactionId) {
            const holder = await env.DB.prepare("SELECT id, apple_token FROM accounts WHERE orig_txn = ? AND id != ?")
              .bind(sub.originalTransactionId, account.id)
              .first<{ id: string; apple_token: string | null }>();
            // The same subscription presented under the same appAccountToken is a family member, not a replay.
            const shared = !!holder && !!sub.appAccountToken && holder.apple_token === sub.appAccountToken;
            if (holder && !shared) throw new HttpError(409, "receipt is linked to another account");
          }

          try {
            await env.DB.prepare(
              // A member who activates a subscription of their own stops following the owner's plan and pool,
              // so an active sync drops the family link it would otherwise never leave.
              active
                ? "UPDATE accounts SET plan = ?, expires_at = ?, apple_token = COALESCE(?, apple_token), orig_txn = ?, family_of = NULL WHERE id = ?"
                : "UPDATE accounts SET plan = ?, expires_at = ?, apple_token = COALESCE(?, apple_token), orig_txn = ? WHERE id = ?",
            )
              .bind(
                active ? sub.plan : "trial",
                active ? sub.expiresAt : 0,
                sub.appAccountToken,
                sub.originalTransactionId,
                account.id,
              )
              .run();
          } catch (e) {
            // A concurrent sync can still lose the unique race on accounts.apple_token.
            if (String((e as { message?: unknown })?.message ?? e).includes("UNIQUE"))
              throw new HttpError(409, "receipt is linked to another account");
            throw e;
          }
          if (active) {
            // Mirror the cleared link so the grant and the response use the account's own pool.
            account.family_of = null;
            await grantMonth(env, pool(account), sub.plan);
          }
          return json({
            plan: active ? sub.plan : "trial",
            credits: await balance(env, pool(account)),
            expiresAt: active ? sub.expiresAt : 0,
          });
        }

        if (req.method === "POST" && path === "/apple/topup") {
          const account = await authenticate(env, req);
          const b = await body(req);
          const transactionId = str(b.transactionId, 100);
          if (!transactionId) throw new HttpError(400, "transactionId is required");
          const verifier = deps.verifier ?? serverApiVerifier(env);
          const sub = await verifier.subscription(transactionId);
          const credits = PRODUCTS[sub.productId]?.topup;
          if (!credits) throw new HttpError(400, "not a top-up product");
          if (sub.revoked) throw new HttpError(402, "purchase was revoked");
          const added = await record(env, pool(account), "topup", credits, `topup:${sub.originalTransactionId}`);
          return json({ creditsAdded: added ? credits : 0, creditsLeft: await balance(env, pool(account)) });
        }

        if (req.method === "POST" && path === "/apple/notifications") {
          const b = await body(req);
          const signed = str(b.signedPayload, 20000);
          const segment = signed.split(".")[1];
          if (!segment) throw new HttpError(400, "missing signedPayload");
          const decoded = JSON.parse(
            new TextDecoder().decode(Uint8Array.from(atob(segment.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))),
          ) as { notificationType?: string; data?: { transactionId?: string; originalTransactionId?: string } };
          const transactionId = decoded.data?.transactionId ?? decoded.data?.originalTransactionId;
          const verifier = deps.verifier ?? serverApiVerifier(env);
          if (transactionId) {
            const sub = await verifier.subscription(transactionId);
            const owner = await env.DB.prepare(
              "SELECT id, plan FROM accounts WHERE orig_txn = ? OR apple_token = ?",
            )
              .bind(sub.originalTransactionId, sub.appAccountToken ?? "")
              .first<{ id: string; plan: Plan }>();
            if (owner) {
              const active = !sub.revoked && sub.expiresAt > Date.now() / 1000;
              await env.DB.prepare("UPDATE accounts SET expires_at = ?, plan = ? WHERE id = ?")
                .bind(active ? sub.expiresAt : 0, active ? sub.plan : "trial", owner.id)
                .run();
              if (active) await grantMonth(env, owner.id, sub.plan);
            }
          }
          return json({ ok: true });
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
