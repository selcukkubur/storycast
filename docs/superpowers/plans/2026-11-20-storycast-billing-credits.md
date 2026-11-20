# Storycast Billing & Credits Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the managed-compute billing subsystem — a Cloudflare Worker that owns fal traffic, credits wallets, plan caps, and App Store subscriptions — plus the shared client credit logic.

**Architecture:** A new `billing/` Worker mirrors the existing `share/` Worker patterns (vanilla fetch router, D1, `HttpError`, `json()` helpers). The client pipeline keeps running film orchestration; the worker only gates it: it debits credits when a job opens, proxies every fal queue call for that job (server-side `FAL_KEY`), and settles/refunds when the job closes. Apple state comes from App Store Server API v2 lookups behind an injectable `AppleVerifier`, so tests never touch Apple. Client-side credit preview logic lives in `web/src/lib/studio/`, and `fal.ts` gains a billing branch while keeping its BYOK path.

**Tech Stack:** TypeScript, Cloudflare Workers (wrangler 4.x), D1, `nodejs_compat`, WebCrypto ES256 (App Store Server API JWT), Vitest + `@cloudflare/vitest-pool-workers` (worker tests), Vitest (web tests).

**Spec:** `docs/superpowers/specs/2026-11-20-storycast-ios-pricing-design.md`

## Scope Notes

- **This plan = billing subsystem only.** It produces working, testable software on its own (runnable worker + smoke script + client lib).
- **Follow-up Plan B:** cost-program eval harness (H3 Lite / Grok Lite A/B, direct ElevenLabs/OpenRouter). Gates launch prices but is not billing code.
- **Follow-up Plan C:** iOS app shell, StoreKit 2 purchase UI, parental gate, and paywall screens (via `/flow-mobile`), consuming the client lib built here.
- **Spec correction (flagged):** apps cannot read the user's Apple ID. Trial binding uses an `identifierForVendor` hash plus a random UUID kept in the iOS Keychain (sent as `device`). This is the implementable reading of "once per Apple ID."

## Global Constraints

- 1 credit = 1 film-minute at 480P; 768P consumes 2 credits per minute; cost = `ceil(minutes × multiplier)`.
- Plan allowances: trial = 1 film (≤1 min, 480P only, watermark); Starter = 3 credits/mo, ≤2 min/film; Family = 5 credits/mo, ≤5 min/film.
- Rollover cap = 2× plan allowance (Starter ≤ 6, Family ≤ 10). Top-up credits never expire while the subscription is active.
- Settlement: refund if the finished film is ≥10% shorter than planned; full automatic refund on terminal job failure; every ledger write idempotent by `ref`.
- No fal key in any client; every fal submission and upload goes through the worker.
- Max 1 running job per wallet pool (matches the client's serial `chain` in `web/src/lib/studio/pipeline.ts:717`).
- Launch gate (ops, not code): subscriptions go live only when COGS ≤ $2.75 per 480P minute.
- Proposed product IDs (register in App Store Connect): `com.storycast.starter.monthly`, `com.storycast.starter.yearly`, `com.storycast.family.monthly`, `com.storycast.family.yearly`, `com.storycast.topup.1`, `com.storycast.topup.3`.

## File Structure

```
billing/
  package.json          worker deps, scripts (dev, deploy, test, check)
  wrangler.jsonc        bindings: DB (D1), vars, ratelimits
  tsconfig.json
  vitest.config.ts      vitest-pool-workers config
  schema.sql            D1 tables (accounts, ledger, jobs, job_calls)
  src/
    index.ts            createApp(deps) router + default export
    http.ts             HttpError, json, str/num, falUrl validators
    credits.ts          pure plan/credit math (parity-tested with web)
    ledger.ts           D1 ledger record/balance helpers
    accounts.ts         createAccount, authenticate, pool resolution
    apple.ts            AppleVerifier interface, PRODUCTS map, serverApiVerifier
  scripts/
    smoke.mjs           end-to-end script against wrangler dev
  test/
    health.test.ts  credits.test.ts  ledger.test.ts  accounts.test.ts
    jobs.test.ts    proxy.test.ts    settle.test.ts   apple.test.ts
    family.test.ts  notifications.test.ts  parity.test.ts
  README.md             setup, secrets, deploy, runbook
web/
  package.json          add vitest + test script
  src/lib/studio/plans.ts        client plan constants + preview outcome
  src/lib/studio/billing.ts      billing session client + run/upload proxies
  src/lib/studio/billing.test.ts
  src/lib/studio/plans.test.ts
  src/lib/studio/fal.ts          modify: route through billing when session active
```

---

### Task 1: Scaffold billing worker with test harness

**Files:**
- Create: `billing/package.json`, `billing/wrangler.jsonc`, `billing/tsconfig.json`, `billing/vitest.config.ts`, `billing/src/http.ts`, `billing/src/index.ts`
- Test: `billing/test/health.test.ts`

**Interfaces:**
- Produces: `Env` (`DB: D1Database`, `FAL_KEY?: string`, `HASH_SALT: string`), `createApp(): { fetch(req, env) }`, default export built from `createApp()`.

- [ ] **Step 1: Write the failing test**

`billing/test/health.test.ts`
```ts
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("health", () => {
  it("answers ok", async () => {
    const res = await SELF.fetch("https://billing.local/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers 404 for unknown routes", async () => {
    const res = await SELF.fetch("https://billing.local/nope");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Create the scaffold files**

`billing/package.json`
```json
{
  "name": "storycast-billing",
  "version": "0.1.0",
  "description": "Storycast billing API: credits, plans, App Store subscriptions, fal proxy",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "check": "tsc --noEmit",
    "test": "vitest run",
    "db:init": "wrangler d1 execute storycast-billing --remote --file schema.sql"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "latest",
    "@cloudflare/workers-types": "latest",
    "typescript": "latest",
    "vitest": "latest",
    "wrangler": "^4.133.0"
  }
}
```

`billing/wrangler.jsonc`
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "storycast-billing",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "vars": { "APPLE_ENVIRONMENT": "sandbox" },
  "d1_databases": [
    { "binding": "DB", "database_name": "storycast-billing", "database_id": "00000000-0000-0000-0000-000000000000" }
  ],
  "ratelimits": [
    { "name": "ACCOUNT_LIMIT", "namespace_id": "2001", "simple": { "limit": 30, "period": 60 } }
  ]
}
```
Deployment note: run `npx wrangler d1 create storycast-billing` and paste the printed `database_id` over the zeros before `wrangler deploy`. Local tests and `wrangler dev` use the emulated D1 regardless of this value.

`billing/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src", "test"]
}
```

`billing/vitest.config.ts`
```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: { workers: { wrangler: { configPath: "./wrangler.jsonc" } } },
  },
});
```

`billing/src/http.ts`
```ts
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const now = () => Math.floor(Date.now() / 1000);

export function randomId(n: number) {
  const abc = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => abc[b % abc.length]).join("");
}

export async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function falUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || !(u.hostname === "fal.media" || u.hostname.endsWith(".fal.media"))) return null;
    return u.toString();
  } catch {
    return null;
  }
}
```

`billing/src/index.ts` (minimal; grows in later tasks)
```ts
import { HttpError, json } from "./http";

export interface Env {
  DB: D1Database;
  FAL_KEY?: string;
  HASH_SALT: string;
}

export function createApp() {
  return {
    async fetch(req: Request, _env: Env): Promise<Response> {
      try {
        const url = new URL(req.url);
        if (req.method === "GET" && url.pathname === "/health") return json({ ok: true });
        throw new HttpError(404, "not found");
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        return json({ error: "internal error" }, 500);
      }
    },
  };
}

export default createApp();
```

- [ ] **Step 3: Install and run the tests**

```bash
cd billing && npm install && npm test
```
Expected: 2 passing tests.

- [ ] **Step 4: Commit**

```bash
git add billing/
git commit -m "Add billing worker scaffold with vitest-pool-workers harness"
```

---

### Task 2: Credit math and plan policy (pure module)

**Files:**
- Create: `billing/src/credits.ts`
- Test: `billing/test/credits.test.ts`

**Interfaces:**
- Produces: `Plan = "trial" | "starter" | "family"`, `Resolution = "480P" | "768P"`, `PLANS`, `multiplier(res)`, `creditsFor(minutes, res)`, `canStart(plan, balance, minutes, res): StartCheck`, `settleRefund(plannedMinutes, res, actualSeconds)`. `StartCheck = { ok: true; cost: number } | { ok: false; reason: "cap" | "credits"; cost: number }`.

- [ ] **Step 1: Write the failing tests**

`billing/test/credits.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { PLANS, canStart, creditsFor, settleRefund } from "../src/credits";

describe("creditsFor", () => {
  it("charges 1 credit per minute at 480P", () => {
    expect(creditsFor(1, "480P")).toBe(1);
    expect(creditsFor(3, "480P")).toBe(3);
  });
  it("charges 2 credits per minute at 768P", () => {
    expect(creditsFor(1, "768P")).toBe(2);
    expect(creditsFor(2.5, "768P")).toBe(5);
  });
});

describe("canStart", () => {
  it("allows a plan-capped film when the balance covers it", () => {
    expect(canStart("starter", 3, 2, "480P")).toEqual({ ok: true, cost: 2 });
  });
  it("rejects films beyond the plan length cap", () => {
    expect(canStart("starter", 99, 3, "480P")).toEqual({ ok: false, reason: "cap", cost: 3 });
    expect(canStart("trial", 99, 2, "480P").ok).toBe(false);
  });
  it("rejects a 768P film the trial cannot pay for", () => {
    expect(canStart("trial", 1, 1, "768P")).toEqual({ ok: false, reason: "credits", cost: 2 });
  });
  it("uses the family cap of 5 minutes", () => {
    expect(canStart("family", 5, 5, "480P")).toEqual({ ok: true, cost: 5 });
    expect(canStart("family", 10, 6, "480P")).toEqual({ ok: false, reason: "cap", cost: 6 });
  });
});

describe("settleRefund", () => {
  it("refunds nothing when the film is close to plan", () => {
    expect(settleRefund(1, "480P", 60)).toBe(0);
    expect(settleRefund(3, "480P", 165)).toBe(0);
  });
  it("refunds whole credits for a much shorter film", () => {
    expect(settleRefund(1, "480P", 30)).toBe(0);
    expect(settleRefund(1, "768P", 30)).toBe(1);
    expect(settleRefund(3, "480P", 90)).toBe(1);
  });
});

describe("PLANS", () => {
  it("matches the approved spec", () => {
    expect(PLANS).toEqual({
      trial: { credits: 1, maxMinutes: 1, rolloverCap: 0 },
      starter: { credits: 3, maxMinutes: 2, rolloverCap: 6 },
      family: { credits: 5, maxMinutes: 5, rolloverCap: 10 },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd billing && npx vitest run test/credits.test.ts
```
Expected: FAIL — cannot resolve `../src/credits`.

- [ ] **Step 3: Implement the module**

`billing/src/credits.ts`
```ts
export type Plan = "trial" | "starter" | "family";
export type Resolution = "480P" | "768P";

export const PLANS: Record<Plan, { credits: number; maxMinutes: number; rolloverCap: number }> = {
  trial: { credits: 1, maxMinutes: 1, rolloverCap: 0 },
  starter: { credits: 3, maxMinutes: 2, rolloverCap: 6 },
  family: { credits: 5, maxMinutes: 5, rolloverCap: 10 },
};

export const multiplier = (res: Resolution) => (res === "768P" ? 2 : 1);

export const creditsFor = (minutes: number, res: Resolution) => Math.ceil(minutes * multiplier(res));

export type StartCheck = { ok: true; cost: number } | { ok: false; reason: "cap" | "credits"; cost: number };

export function canStart(plan: Plan, balance: number, minutes: number, res: Resolution): StartCheck {
  const cost = creditsFor(minutes, res);
  if (minutes > PLANS[plan].maxMinutes) return { ok: false, reason: "cap", cost };
  if (balance < cost) return { ok: false, reason: "credits", cost };
  return { ok: true, cost };
}

export function settleRefund(plannedMinutes: number, res: Resolution, actualSeconds: number): number {
  const planned = creditsFor(plannedMinutes, res);
  if (actualSeconds >= plannedMinutes * 60 * 0.9) return 0;
  return Math.max(0, planned - creditsFor(Math.ceil(actualSeconds) / 60, res));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd billing && npx vitest run test/credits.test.ts
```
Expected: PASS (all cases above).

- [ ] **Step 5: Commit**

```bash
git add billing/src/credits.ts billing/test/credits.test.ts
git commit -m "Add credit math and plan policy module"
```

---

### Task 3: D1 schema and ledger

**Files:**
- Create: `billing/schema.sql`
- Create: `billing/src/ledger.ts`
- Test: `billing/test/ledger.test.ts`

**Interfaces:**
- Produces: `record(db, pool, kind, credits, ref, jobId?): Promise<boolean>` (true when the entry was newly inserted), `balance(db, pool): Promise<number>`, `EntryKind = "grant" | "topup" | "debit" | "refund" | "adjust"`. Both helpers take a minimal structural `{ DB: D1Database }` so they accept `Env` directly.

- [ ] **Step 1: Write the schema**

`billing/schema.sql`
```sql
CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  device_hash  TEXT NOT NULL,
  idfv_hash    TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'trial',
  expires_at   INTEGER NOT NULL DEFAULT 0,
  apple_token  TEXT UNIQUE,
  orig_txn     TEXT NOT NULL DEFAULT '',
  family_of    TEXT,
  created      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_device ON accounts (device_hash);
CREATE INDEX IF NOT EXISTS accounts_idfv ON accounts (idfv_hash);

CREATE TABLE IF NOT EXISTS ledger (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  pool     TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('grant','topup','debit','refund','adjust')),
  credits  INTEGER NOT NULL,
  ref      TEXT NOT NULL UNIQUE,
  job_id   TEXT,
  created  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_pool ON ledger (pool);

CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  account    TEXT NOT NULL,
  pool       TEXT NOT NULL,
  minutes    INTEGER NOT NULL,
  resolution TEXT NOT NULL,
  credits    INTEGER NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('running','done','error')),
  video_url  TEXT,
  settled    INTEGER NOT NULL DEFAULT 0,
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_pool ON jobs (pool, status);

CREATE TABLE IF NOT EXISTS job_calls (
  request_id TEXT PRIMARY KEY,
  job_id     TEXT NOT NULL,
  app        TEXT NOT NULL,
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS job_calls_job ON job_calls (job_id);
```

- [ ] **Step 2: Write the failing test**

`billing/test/ledger.test.ts`
```ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";
import { balance, record } from "../src/ledger";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema);
});

describe("ledger", () => {
  it("records a grant once and ignores duplicate refs", async () => {
    expect(await record(db, "acct1", "grant", 1, "trial:acct1")).toBe(true);
    expect(await record(db, "acct1", "grant", 1, "trial:acct1")).toBe(false);
    expect(await balance(db, "acct1")).toBe(1);
  });

  it("debits with negative credits and refunds back", async () => {
    await record(db, "acct1", "grant", 3, "grant:acct1");
    await record(db, "acct1", "debit", -2, "debit:job1", "job1");
    expect(await balance(db, "acct1")).toBe(1);
    await record(db, "acct1", "refund", 1, "refund:job1", "job1");
    expect(await balance(db, "acct1")).toBe(2);
  });

  it("keeps pools isolated", async () => {
    await record(db, "poolA", "grant", 5, "grant:a");
    await record(db, "poolB", "grant", 2, "grant:b");
    expect(await balance(db, "poolA")).toBe(5);
    expect(await balance(db, "poolB")).toBe(2);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd billing && npx vitest run test/ledger.test.ts
```
Expected: FAIL — cannot resolve `../src/ledger`.

- [ ] **Step 4: Implement the ledger**

`billing/src/ledger.ts`
```ts
import { now } from "./http";

type Db = { DB: D1Database };

export type EntryKind = "grant" | "topup" | "debit" | "refund" | "adjust";

export async function record(db: Db, pool: string, kind: EntryKind, credits: number, ref: string, jobId?: string): Promise<boolean> {
  const r = await db.DB.prepare(
    "INSERT OR IGNORE INTO ledger (pool, kind, credits, ref, job_id, created) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(pool, kind, credits, ref, jobId ?? null, now())
    .run();
  return (r.meta?.changes ?? 0) === 1;
}

export async function balance(db: Db, pool: string): Promise<number> {
  const r = await db.DB.prepare("SELECT COALESCE(SUM(credits), 0) AS b FROM ledger WHERE pool = ?").bind(pool).first<{ b: number }>();
  return r?.b ?? 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd billing && npx vitest run test/ledger.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add billing/schema.sql billing/src/ledger.ts billing/test/ledger.test.ts
git commit -m "Add D1 schema and idempotent ledger helpers"
```

---

### Task 4: Accounts, bearer auth, trial grant, wallet

**Files:**
- Create: `billing/src/accounts.ts`
- Modify: `billing/src/index.ts` (add router routes)
- Test: `billing/test/accounts.test.ts`

**Interfaces:**
- Consumes: `record`, `balance` (Task 3), `PLANS` (Task 2).
- Produces: `Account` row type, `createAccount(env, device, idfv): Promise<{ account: string; token: string }>`, `authenticate(env, req): Promise<Account>`, `pool(account): string` (family owner id or own id), `planOf(account): Plan` (expired subscriptions fall back to `"trial"`). Routes: `POST /accounts {device, idfv}` → `{account, token}`; `GET /wallet` (auth) → `{plan, credits, maxMinutes, familyOf, expiresAt}`.

- [ ] **Step 1: Write the failing test**

`billing/test/accounts.test.ts`
```ts
import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema);
});

async function register(device = "dev-1", idfv = "idfv-1") {
  const res = await SELF.fetch("https://billing.local/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device, idfv }),
  });
  return { status: res.status, body: (await res.json()) as { account?: string; token?: string; error?: string } };
}

describe("accounts", () => {
  it("registers a device with a one-film trial credit", async () => {
    const r = await register();
    expect(r.status).toBe(200);
    const wallet = await SELF.fetch("https://billing.local/wallet", {
      headers: { authorization: `Bearer ${r.body.token}` },
    });
    const body = (await wallet.json()) as { plan: string; credits: number; maxMinutes: number };
    expect(wallet.status).toBe(200);
    expect(body).toMatchObject({ plan: "trial", credits: 1, maxMinutes: 1 });
  });

  it("refuses a second device registration and never double-grants", async () => {
    await register();
    const again = await register();
    expect(again.status).toBe(409);
    const rows = await db.DB.prepare("SELECT COUNT(*) AS n FROM ledger").first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it("rejects missing or bad tokens", async () => {
    const res = await SELF.fetch("https://billing.local/wallet");
    expect(res.status).toBe(401);
    const bad = await SELF.fetch("https://billing.local/wallet", { headers: { authorization: "Bearer nope" } });
    expect(bad.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd billing && npx vitest run test/accounts.test.ts
```
Expected: FAIL — `/accounts` and `/wallet` return 404.

- [ ] **Step 3: Implement accounts and auth**

`billing/src/accounts.ts`
```ts
import { PLANS, type Plan } from "./credits";
import { HttpError, now, randomId, sha256, str } from "./http";
import { record } from "./ledger";

type Db = { DB: D1Database; HASH_SALT: string };

export type Account = {
  id: string;
  plan: Plan;
  expires_at: number;
  apple_token: string | null;
  orig_txn: string;
  family_of: string | null;
  created: number;
};

export const pool = (account: Account) => account.family_of ?? account.id;

export const planOf = (account: Account): Plan =>
  account.plan === "trial" || account.expires_at > now() ? account.plan : "trial";

export async function createAccount(env: Db, device: string, idfv: string) {
  const deviceHash = await sha256(`${env.HASH_SALT}|d|${str(device, 200)}`);
  const idfvHash = await sha256(`${env.HASH_SALT}|i|${str(idfv, 200)}`);
  const existing = await env.DB.prepare("SELECT id FROM accounts WHERE device_hash = ?").bind(deviceHash).first<{ id: string }>();
  if (existing) throw new HttpError(409, "this device is already registered");

  const id = randomId(12);
  const token = randomId(40);
  await env.DB.prepare(
    "INSERT INTO accounts (id, token_hash, device_hash, idfv_hash, plan, created) VALUES (?, ?, ?, ?, 'trial', ?)",
  )
    .bind(id, await sha256(token), deviceHash, idfvHash, now())
    .run();
  await record(env, id, "grant", PLANS.trial.credits, `trial:${id}`);
  return { account: id, token };
}

export async function authenticate(env: Db, req: Request): Promise<Account> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "missing token");
  const row = await env.DB.prepare(
    "SELECT id, plan, expires_at, apple_token, orig_txn, family_of, created FROM accounts WHERE token_hash = ?",
  )
    .bind(await sha256(token))
    .first<Account>();
  if (!row) throw new HttpError(401, "bad token");
  return row;
}
```

- [ ] **Step 4: Wire the routes into `index.ts`**

Replace `billing/src/index.ts` with:
```ts
import { authenticate, createAccount, planOf, pool } from "./accounts";
import { PLANS } from "./credits";
import { HttpError, json, str } from "./http";
import { balance } from "./ledger";

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
```

- [ ] **Step 5: Run the full suite**

```bash
cd billing && npm test
```
Expected: PASS — health, credits, ledger, accounts.

- [ ] **Step 6: Commit**

```bash
git add billing/src/index.ts billing/src/accounts.ts billing/test/accounts.test.ts
git commit -m "Add device accounts, bearer auth, trial grant and wallet endpoint"
```

---

### Task 5: Job creation with plan caps

**Files:**
- Modify: `billing/src/index.ts` (add `POST /jobs`)
- Test: `billing/test/jobs.test.ts`

**Interfaces:**
- Consumes: `authenticate`, `pool`, `planOf` (Task 4), `canStart`, `creditsFor` (Task 2), `record`, `balance` (Task 3).
- Produces: `POST /jobs` (auth) `{minutes: number, resolution: "480P" | "768P"}` → `{jobId, cost, creditsLeft, watermark}`. Errors: 400 bad input, 402 `credits`, 422 `cap`, 409 `a film is already in production`.

- [ ] **Step 1: Write the failing test**

`billing/test/jobs.test.ts`
```ts
import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema);
});

async function register(device = "dev-1") {
  const res = await SELF.fetch("https://billing.local/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device, idfv: `idfv-${device}` }),
  });
  return (await res.json()) as { account: string; token: string };
}

const start = (token: string, minutes: number, resolution = "480P") =>
  SELF.fetch("https://billing.local/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ minutes, resolution }),
  });

async function makeStarter(account: string) {
  await db.DB.prepare("UPDATE accounts SET plan = 'starter', expires_at = 9999999999 WHERE id = ?").bind(account).run();
  await db.DB.prepare("INSERT INTO ledger (pool, kind, credits, ref, created) VALUES (?, 'grant', 2, ?, 0)")
    .bind(account, `grant:extra:${account}`)
    .run();
}

describe("POST /jobs", () => {
  it("starts a trial film and debits its only credit", async () => {
    const { token } = await register();
    const res = await start(token, 1);
    expect(res.status).toBe(200);
    const b = (await res.json()) as { jobId: string; cost: number; creditsLeft: number; watermark: boolean };
    expect(b.cost).toBe(1);
    expect(b.creditsLeft).toBe(0);
    expect(b.watermark).toBe(true);
  });

  it("refuses a second film when credits are gone", async () => {
    const { token } = await register();
    await start(token, 1);
    const res = await start(token, 1);
    expect(res.status).toBe(402);
  });

  it("refuses a film beyond the plan length cap", async () => {
    const { token, account } = await register();
    await makeStarter(account);
    const res = await start(token, 3);
    expect(res.status).toBe(422);
  });

  it("allows only one running film per pool", async () => {
    const { token, account } = await register();
    await makeStarter(account);
    await start(token, 1);
    const res = await start(token, 1);
    expect(res.status).toBe(409);
  });

  it("rejects unknown resolutions", async () => {
    const { token } = await register();
    const res = await start(token, 1, "1080P");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd billing && npx vitest run test/jobs.test.ts
```
Expected: FAIL — `/jobs` returns 404.

- [ ] **Step 3: Add the route**

In `billing/src/index.ts`, extend the imports:
```ts
import { authenticate, createAccount, planOf, pool } from "./accounts";
import { PLANS, canStart, type Resolution } from "./credits";
import { HttpError, json, num, now, randomId, str } from "./http";
import { balance, record } from "./ledger";
```

Insert before the `throw new HttpError(404, "not found")` line:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd billing && npx vitest run test/jobs.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add billing/src/index.ts billing/test/jobs.test.ts
git commit -m "Add job creation with plan caps, credit debit and pool exclusivity"
```

---

### Task 6: fal proxy and upload

**Files:**
- Create: `billing/src/proxy.ts`
- Modify: `billing/src/index.ts` (add call/status/result/upload routes)
- Test: `billing/test/proxy.test.ts`

**Interfaces:**
- Produces: `ALLOWED_APPS: Set<string>` (the 16 endpoints in `web/src/lib/studio/pipeline.ts:9-24` plus `fal-ai/ffmpeg-api/metadata`), `falSubmit(env, app, input)`, `falStatus(env, app, requestId)`, `falResult(env, app, requestId)`, `falUpload(env, file)`. Routes (all auth; the job must belong to the caller and be `running`): `POST /jobs/:id/calls {app, input}` → fal submit body; `GET /jobs/:id/calls/:rid/status`; `GET /jobs/:id/calls/:rid/result`; `POST /upload` (multipart) → `{url}`.

- [ ] **Step 1: Write the failing test**

`billing/test/proxy.test.ts`
```ts
import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema);
});

async function setup() {
  const acc = await (
    await SELF.fetch("https://billing.local/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: "dev-1", idfv: "idfv-1" }),
    })
  ).json<{ account: string; token: string }>();
  const job = await (
    await SELF.fetch("https://billing.local/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${acc.token}` },
      body: JSON.stringify({ minutes: 1, resolution: "480P" }),
    })
  ).json<{ jobId: string }>();
  return { token: acc.token, jobId: job.jobId };
}

describe("fal proxy", () => {
  it("submits an allowlisted app and remembers the request", async () => {
    const { token, jobId } = await setup();
    const fal = vi.fn(async () => new Response(JSON.stringify({ request_id: "req-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fal);

    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: "fal-ai/ffmpeg-api/metadata", input: { media_url: "https://fal.media/x.mp4" } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ request_id: "req-1" });
    expect(String(fal.mock.calls[0][0])).toBe("https://queue.fal.run/fal-ai/ffmpeg-api/metadata");

    const row = await db.DB.prepare("SELECT app FROM job_calls WHERE request_id = 'req-1'").first<{ app: string }>();
    expect(row?.app).toBe("fal-ai/ffmpeg-api/metadata");
  });

  it("refuses apps outside the allowlist", async () => {
    const { token, jobId } = await setup();
    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: "someone-else/expensive-model", input: {} }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses calls on jobs that are no longer running", async () => {
    const { token, jobId } = await setup();
    await db.DB.prepare("UPDATE jobs SET status = 'done' WHERE id = ?").bind(jobId).run();
    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: "fal-ai/ffmpeg-api/metadata", input: {} }),
    });
    expect(res.status).toBe(409);
  });

  it("proxies status for a remembered request", async () => {
    const { token, jobId } = await setup();
    await db.DB.prepare("INSERT INTO job_calls (request_id, job_id, app, created) VALUES ('req-9', ?, 'fal-ai/ffmpeg-api/metadata', 0)")
      .bind(jobId)
      .run();
    const fal = vi.fn(async () => new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 }));
    vi.stubGlobal("fetch", fal);

    const res = await SELF.fetch(`https://billing.local/jobs/${jobId}/calls/req-9/status`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(String(fal.mock.calls[0][0])).toBe("https://queue.fal.run/fal-ai/ffmpeg-api/metadata/requests/req-9/status");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd billing && npx vitest run test/proxy.test.ts
```
Expected: FAIL — `/jobs/:id/calls` returns 404.

- [ ] **Step 3: Implement the proxy**

`billing/src/proxy.ts`
```ts
import { HttpError } from "./http";

type Env = { FAL_KEY?: string };

export const ALLOWED_APPS = new Set([
  "openai/gpt-image-2.5/flare/text-to-image",
  "openai/gpt-image-2.5/flare/edit",
  "minimax/h3-max/reference-to-video",
  "minimax/h3-max/lip-sync/image-to-video",
  "fal-ai/elevenlabs/tts/eleven-v3",
  "elevenlabs/music/v2.5",
  "fal-ai/workflow-utilities/trim-video",
  "fal-ai/ffmpeg-api/merge-videos",
  "fal-ai/ffmpeg-api/images-to-video",
  "fal-ai/ffmpeg-api/compose",
  "fal-ai/ffmpeg-api/loudnorm",
  "fal-ai/ffmpeg-api/merge-audio-video",
  "fal-ai/workflow-utilities/auto-subtitle",
  "fal-ai/ffmpeg-api/extract-frame",
  "fal-ai/ffmpeg-api/metadata",
  "openrouter/router/vision",
]);

const auth = (env: Env) => {
  if (!env.FAL_KEY) throw new HttpError(500, "fal key not configured");
  return { authorization: `Key ${env.FAL_KEY}` };
};

async function falFetch(env: Env, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...auth(env), ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new HttpError(r.status >= 500 ? 502 : r.status, `fal answered ${r.status}: ${text.slice(0, 200)}`);
  return text;
}

export const falSubmit = (env: Env, app: string, input: Record<string, unknown>) =>
  falFetch(env, `https://queue.fal.run/${app}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then((t) => JSON.parse(t) as { request_id: string });

export const falStatus = (env: Env, app: string, requestId: string) =>
  falFetch(env, `https://queue.fal.run/${app}/requests/${requestId}/status`).then((t) => JSON.parse(t));

export const falResult = (env: Env, app: string, requestId: string) =>
  falFetch(env, `https://queue.fal.run/${app}/requests/${requestId}`).then((t) => JSON.parse(t));

export async function falUpload(env: Env, file: File) {
  const init = JSON.parse(
    await falFetch(env, "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content_type: file.type || "application/octet-stream", file_name: file.name || "upload" }),
    }),
  ) as { upload_url: string; file_url: string };
  const put = await fetch(init.upload_url, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: await file.arrayBuffer(),
  });
  if (!put.ok) throw new HttpError(502, `storage upload failed: ${put.status}`);
  return { url: init.file_url };
}
```

- [ ] **Step 4: Wire the routes into `index.ts`**

Add to the imports:
```ts
import { ALLOWED_APPS, falResult, falStatus, falSubmit, falUpload } from "./proxy";
```

Insert before the 404 line:
```ts
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
```

- [ ] **Step 5: Run the proxy tests**

```bash
cd billing && npx vitest run test/proxy.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add billing/src/proxy.ts billing/src/index.ts billing/test/proxy.test.ts
git commit -m "Add allowlisted fal proxy and upload endpoints"
```

---

### Task 7: Job settlement with duration-checked refunds

**Files:**
- Modify: `billing/src/proxy.ts` (add `falMetadata`)
- Modify: `billing/src/index.ts` (add `POST /jobs/:id/settle`)
- Test: `billing/test/settle.test.ts`

**Interfaces:**
- Consumes: `settleRefund` (Task 2), `record`/`balance` (Task 3), `authenticate` (Task 4).
- Produces: `falMetadata(env, mediaUrl): Promise<{ duration: number }>` via the synchronous `https://fal.run/fal-ai/ffmpeg-api/metadata` endpoint. Route: `POST /jobs/:id/settle {outcome: "done" | "error", videoUrl?}` → `{refund, creditsLeft, already?}`. Full refund on `error`; on `done` the duration is fetched server-side — client-reported durations are never trusted.

- [ ] **Step 1: Write the failing test**

`billing/test/settle.test.ts`
```ts
import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema.sql?raw";

const db = env as unknown as { DB: D1Database };

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema);
});

async function twoMinuteStarter() {
  const acc = await (
    await SELF.fetch("https://billing.local/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: "dev-1", idfv: "idfv-1" }),
    })
  ).json<{ account: string; token: string }>();
  await db.DB.prepare("UPDATE accounts SET plan = 'starter', expires_at = 9999999999 WHERE id = ?").bind(acc.account).run();
  await db.DB.prepare("INSERT INTO ledger (pool, kind, credits, ref, created) VALUES (?, 'grant', 4, 'extra', 0)").bind(acc.account).run();
  const job = await (
    await SELF.fetch("https://billing.local/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${acc.token}` },
      body: JSON.stringify({ minutes: 2, resolution: "480P" }),
    })
  ).json<{ jobId: string }>();
  return { token: acc.token, jobId: job.jobId };
}

const settle = (token: string, jobId: string, payload: Record<string, unknown>) =>
  SELF.fetch(`https://billing.local/jobs/${jobId}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

describe("settle", () => {
  it("keeps the full charge when the film is close to plan", async () => {
    const { token, jobId } = await twoMinuteStarter();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ media: { duration: 95 } }), { status: 200 })));
    const res = await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/film.mp4" });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { refund: number; creditsLeft: number };
    expect(b.refund).toBe(0);
    expect(b.creditsLeft).toBe(3);
  });

  it("refunds a whole credit for a 30s film planned as 2 min", async () => {
    const { token, jobId } = await twoMinuteStarter();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ media: { duration: 30 } }), { status: 200 })));
    const b = (await (await settle(token, jobId, { outcome: "done", videoUrl: "https://fal.media/files/x/short.mp4" })).json()) as {
      refund: number;
      creditsLeft: number;
    };
    expect(b.refund).toBe(1);
    expect(b.creditsLeft).toBe(4);
  });

  it("refunds everything on error and is idempotent", async () => {
    const { token, jobId } = await twoMinuteStarter();
    const first = (await (await settle(token, jobId, { outcome: "error" })).json()) as { refund: number };
    const second = (await (await settle(token, jobId, { outcome: "error" })).json()) as { refund: number; already: boolean };
    expect(first.refund).toBe(2);
    expect(second).toMatchObject({ refund: 0, already: true });
  });

  it("rejects a non-fal video URL", async () => {
    const { token, jobId } = await twoMinuteStarter();
    const res = await settle(token, jobId, { outcome: "done", videoUrl: "https://evil.example/film.mp4" });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd billing && npx vitest run test/settle.test.ts
```
Expected: FAIL — `/settle` returns 404.

- [ ] **Step 3: Add `falMetadata` to `billing/src/proxy.ts`**

```ts
export async function falMetadata(env: Env, mediaUrl: string) {
  const text = await falFetch(env, "https://fal.run/fal-ai/ffmpeg-api/metadata", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ media_url: mediaUrl }),
  });
  const body = JSON.parse(text) as { media: { duration: number } };
  return { duration: Number(body.media?.duration ?? 0) };
}
```

- [ ] **Step 4: Add the settle route to `billing/src/index.ts`**

Extend imports:
```ts
import { settleRefund } from "./credits";
import { falUrl } from "./http";
import { ALLOWED_APPS, falMetadata, falResult, falStatus, falSubmit, falUpload } from "./proxy";
```

Insert before the 404 line:
```ts
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
```

- [ ] **Step 5: Run the full suite**

```bash
cd billing && npm test
```
Expected: PASS — all suites from Tasks 1–7.

- [ ] **Step 6: Commit**

```bash
git add billing/src/proxy.ts billing/src/index.ts billing/test/settle.test.ts
git commit -m "Add job settlement with server-verified duration refunds"
```

---

### Task 8: Apple verification, subscription sync, top-ups

**Files:**
- Create: `billing/src/apple.ts`
- Modify: `billing/src/index.ts` (deps injection, two routes)
- Test: `billing/test/apple.test.ts`

**Interfaces:**
- Produces: `AppleVerifier { subscription(transactionId: string): Promise<Subscription> }`; `Subscription = { plan: Plan; productId: string; expiresAt: number; originalTransactionId: string; appAccountToken: string | null; environment: "Sandbox" | "Production"; revoked: boolean }`; `PRODUCTS` map; `serverApiVerifier(env): AppleVerifier` (ES256 JWT + App Store Server API v2 lookup). `createApp(deps?: { verifier?: AppleVerifier })` — tests inject a fake verifier and call `app.fetch(...)` directly (never `SELF`, which would use the production verifier). Routes: `POST /apple/subscription` (auth) and `POST /apple/topup` (auth).

- [ ] **Step 1: Write the failing test**

`billing/test/apple.test.ts`
```ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";
import { createApp } from "../src/index";
import type { AppleVerifier, Subscription } from "../src/apple";

const db = env as unknown as { DB: D1Database; HASH_SALT: string };

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
    env,
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
    env,
  );

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema);
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd billing && npx vitest run test/apple.test.ts
```
Expected: FAIL — `createApp` takes no options and `/apple/*` returns 404.

- [ ] **Step 3: Implement `billing/src/apple.ts`**

```ts
import type { Plan } from "./credits";

export type Subscription = {
  plan: Plan;
  productId: string;
  expiresAt: number;
  originalTransactionId: string;
  appAccountToken: string | null;
  environment: "Sandbox" | "Production";
  revoked: boolean;
};

export interface AppleVerifier {
  subscription(transactionId: string): Promise<Subscription>;
}

export const PRODUCTS: Record<string, { plan?: Plan; topup?: number }> = {
  "com.storycast.starter.monthly": { plan: "starter" },
  "com.storycast.starter.yearly": { plan: "starter" },
  "com.storycast.family.monthly": { plan: "family" },
  "com.storycast.family.yearly": { plan: "family" },
  "com.storycast.topup.1": { topup: 1 },
  "com.storycast.topup.3": { topup: 3 },
};

type AppleEnv = {
  APPLE_ENVIRONMENT?: string;
  APPLE_ISSUER?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_BUNDLE_ID?: string;
};

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const unb64url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
};

async function serverJwt(env: AppleEnv): Promise<string> {
  if (!env.APPLE_PRIVATE_KEY || !env.APPLE_KEY_ID || !env.APPLE_ISSUER || !env.APPLE_BUNDLE_ID)
    throw new Error("apple server API is not configured");
  const pem = env.APPLE_PRIVATE_KEY.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: env.APPLE_ISSUER, iat: now, exp: now + 300, aud: "appstoreconnect-v1", bid: env.APPLE_BUNDLE_ID }),
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export function serverApiVerifier(env: AppleEnv): AppleVerifier {
  return {
    async subscription(transactionId: string): Promise<Subscription> {
      const host =
        env.APPLE_ENVIRONMENT === "production"
          ? "https://api.storekit.itunes.apple.com"
          : "https://api.storekit-sandbox.itunes.apple.com";
      const r = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
        headers: { authorization: `Bearer ${await serverJwt(env)}` },
      });
      if (!r.ok) throw new Error(`apple lookup answered ${r.status}`);
      const body = (await r.json()) as { signedTransactionInfo: string };
      const info = unb64url(body.signedTransactionInfo.split(".")[1]) as {
        productId: string;
        expiresDate?: number;
        originalTransactionId: string;
        appAccountToken?: string;
        environment?: string;
        revocationDate?: number;
      };
      const product = PRODUCTS[info.productId];
      if (!product?.plan) throw new Error(`unknown subscription product ${info.productId}`);
      return {
        plan: product.plan,
        productId: info.productId,
        expiresAt: Math.floor((info.expiresDate ?? 0) / 1000),
        originalTransactionId: info.originalTransactionId,
        appAccountToken: info.appAccountToken ?? null,
        environment: info.environment === "Production" ? "Production" : "Sandbox",
        revoked: Boolean(info.revocationDate),
      };
    },
  };
}
```

- [ ] **Step 4: Extend `billing/src/index.ts`**

Change the factory to accept deps and add the two routes:
```ts
import { PRODUCTS, serverApiVerifier, type AppleVerifier } from "./apple";

export type Deps = { verifier?: AppleVerifier };

export function createApp(deps: Deps = {}) {
```
Inside `fetch`, before the 404 line:
```ts
        if (req.method === "POST" && path === "/apple/subscription") {
          const account = await authenticate(env, req);
          const b = await body(req);
          const verifier = deps.verifier ?? serverApiVerifier(env);
          const sub = await verifier.subscription(str(b.transactionId, 100));
          const active = !sub.revoked && sub.expiresAt > now();
          const plan: Plan = active ? sub.plan : "trial";
          await env.DB.prepare(
            "UPDATE accounts SET plan = ?, expires_at = ?, apple_token = COALESCE(?, apple_token), orig_txn = ? WHERE id = ?",
          )
            .bind(
              active ? sub.plan : account.plan,
              sub.expiresAt,
              sub.appAccountToken,
              sub.originalTransactionId,
              account.id,
            )
            .run();
          if (active) await grantMonth(env, pool(account), sub.plan);
          return json({ plan, credits: await balance(env, pool(account)), expiresAt: sub.expiresAt });
        }

        if (req.method === "POST" && path === "/apple/topup") {
          const account = await authenticate(env, req);
          const b = await body(req);
          const verifier = deps.verifier ?? serverApiVerifier(env);
          const sub = await verifier.subscription(str(b.transactionId, 100));
          const credits = PRODUCTS[sub.productId]?.topup;
          if (!credits) throw new HttpError(400, "not a top-up product");
          if (sub.revoked) throw new HttpError(402, "purchase was revoked");
          await record(env, pool(account), "topup", credits, `topup:${sub.originalTransactionId}`);
          return json({ creditsAdded: credits, creditsLeft: await balance(env, pool(account)) });
        }
```
Add the helper below `body`:
```ts
const period = () => new Date().toISOString().slice(0, 7);

async function grantMonth(env: Env, walletPool: string, plan: Plan) {
  const bal = await balance(env, walletPool);
  const grant = Math.min(PLANS[plan].credits, Math.max(0, PLANS[plan].rolloverCap - bal));
  if (grant > 0) await record(env, walletPool, "grant", grant, `grant:${period()}:${walletPool}`);
}
```
Also import `Plan` from `./credits`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd billing && npx vitest run test/apple.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add billing/src/apple.ts billing/src/index.ts billing/test/apple.test.ts
git commit -m "Add App Store verification, subscription sync and top-ups"
```

---

### Task 9: Family Sharing pool mapping

**Files:**
- Modify: `billing/src/accounts.ts` (add `effective`)
- Modify: `billing/src/index.ts` (use `effective`; link members on subscription sync)
- Test: `billing/test/family.test.ts`

**Interfaces:**
- Consumes: `Account`, `planOf`, `pool` (Task 4), `/apple/subscription` (Task 8).
- Produces: `effective(env, account): Promise<{ plan: Plan; walletPool: string }>` — resolves the family owner's plan and pool. A member whose subscription lookup returns an `appAccountToken` already owned by another account is linked (`family_of`) instead of getting their own grant.

- [ ] **Step 1: Write the failing test**

`billing/test/family.test.ts`
```ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "../schema.sql?raw";
import { createApp } from "../src/index";
import type { Subscription } from "../src/apple";

const db = env as unknown as { DB: D1Database; HASH_SALT: string };
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
    env,
  );
const get = (path: string, token: string) =>
  app.fetch(new Request(`https://billing.local${path}`, { headers: { authorization: `Bearer ${token}` } }), env);

async function register(device: string) {
  const r = await app.fetch(
    new Request("https://billing.local/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device, idfv: `idfv-${device}` }),
    }),
    env,
  );
  return (await r.json()) as { account: string; token: string };
}

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema);
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd billing && npx vitest run test/family.test.ts
```
Expected: FAIL — member keeps trial plan and own pool.

- [ ] **Step 3: Add `effective` to `billing/src/accounts.ts`**

```ts
export async function effective(env: Db, account: Account): Promise<{ plan: Plan; walletPool: string }> {
  if (!account.family_of) return { plan: planOf(account), walletPool: account.id };
  const owner = await env.DB.prepare(
    "SELECT id, plan, expires_at, apple_token, orig_txn, family_of, created FROM accounts WHERE id = ?",
  )
    .bind(account.family_of)
    .first<Account>();
  if (!owner) return { plan: planOf(account), walletPool: account.id };
  return { plan: planOf(owner), walletPool: owner.id };
}
```

- [ ] **Step 4: Use it in `/wallet` and `/jobs`, and link members on sync**

In `/wallet` replace the `plan`/`credits` computation:
```ts
          const account = await authenticate(env, req);
          const { plan, walletPool } = await effective(env, account);
          return json({
            plan,
            credits: await balance(env, walletPool),
            maxMinutes: PLANS[plan].maxMinutes,
            familyOf: account.family_of,
            expiresAt: account.expires_at,
          });
```
In `/jobs` replace `const plan = planOf(account); const walletPool = pool(account);` with:
```ts
          const { plan, walletPool } = await effective(env, account);
```
In `/apple/subscription`, before updating the account, add the family link:
```ts
          if (sub.appAccountToken) {
            const owner = await env.DB.prepare("SELECT id, plan, expires_at FROM accounts WHERE apple_token = ? AND id != ?")
              .bind(sub.appAccountToken, account.id)
              .first<{ id: string; plan: Plan; expires_at: number }>();
            if (owner && active) {
              await env.DB.prepare("UPDATE accounts SET family_of = ? WHERE id = ?").bind(owner.id, account.id).run();
              await grantMonth(env, owner.id, owner.plan === "trial" ? sub.plan : owner.plan);
              return json({ plan: owner.plan === "trial" ? sub.plan : owner.plan, credits: await balance(env, owner.id), expiresAt: owner.expires_at });
            }
          }
```
Also change the `import { authenticate, createAccount, planOf, pool }` line to `import { authenticate, createAccount, effective } from "./accounts";` and delete now-unused imports.

- [ ] **Step 5: Run the full suite**

```bash
cd billing && npm test
```
Expected: PASS — all suites incl. family.

- [ ] **Step 6: Commit**

```bash
git add billing/src/accounts.ts billing/src/index.ts billing/test/family.test.ts
git commit -m "Add Family Sharing pool mapping via appAccountToken"
```

---

### Task 10: App Store Server Notifications webhook

**Files:**
- Modify: `billing/src/index.ts` (add `POST /apple/notifications`)
- Test: `billing/test/notifications.test.ts`

**Interfaces:**
- Consumes: `AppleVerifier` (Task 8), `grantMonth` (Task 8), `effective` (Task 9).
- Produces: `POST /apple/notifications` (no bearer auth; Apple-signed body). The payload's `signedPayload` is decoded only to extract lookup ids; all state is re-derived from `verifier.subscription(transactionId)`, so a spoofed payload cannot grant credits. Idempotent through ledger refs and `expires_at` writes. Always answers 200 after successful processing (Apple retries on non-2xx).

- [ ] **Step 1: Write the failing test**

`billing/test/notifications.test.ts`
```ts
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
    env,
  );

beforeEach(async () => {
  await db.DB.exec("DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS jobs; DROP TABLE IF EXISTS job_calls;");
  await db.DB.exec(schema);
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

    const wallet = (await (await app.fetch(new Request("https://billing.local/wallet", { headers: { authorization: `Bearer ${acc.token}` } }), env)).json()) as { plan: string };
    expect(wallet.plan).toBe("trial");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd billing && npx vitest run test/notifications.test.ts
```
Expected: FAIL — `/apple/notifications` returns 404.

- [ ] **Step 3: Add the route to `billing/src/index.ts`**

Insert before the 404 line:
```ts
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
                .bind(active ? sub.expiresAt : 0, active ? sub.plan : owner.plan, owner.id)
                .run();
              if (active) await grantMonth(env, owner.id, sub.plan);
            }
          }
          return json({ ok: true });
        }
```

- [ ] **Step 4: Run the full suite**

```bash
cd billing && npm test
```
Expected: PASS — all suites.

- [ ] **Step 5: Commit**

```bash
git add billing/src/index.ts billing/test/notifications.test.ts
git commit -m "Add App Store Server Notifications webhook with verified state"
```

---

### Task 11: Client billing lib in `web/`

**Files:**
- Modify: `web/package.json` (add vitest + test script)
- Create: `web/src/lib/studio/plans.ts`, `web/src/lib/studio/plans.test.ts`
- Create: `web/src/lib/studio/billing.ts`, `web/src/lib/studio/billing.test.ts`
- Modify: `web/src/lib/studio/fal.ts` (billing branch in `run` and `upload`)
- Test: `billing/test/parity.test.ts` (guards client/server drift)

**Interfaces:**
- Consumes: the worker routes from Tasks 4–7.
- Produces: `previewOutcome(plan, credits, minutes, res): PlanOutcome`, `billingActive(): boolean`, `registerDevice(device, idfv)`, `wallet()`, `startFilm(minutes, res)`, `billingRun<T>(app, input)`, `billingUpload(file)`, `settleFilm(outcome, videoUrl?)`, `BillingError { status, reason }`. `fal.run()` and `fal.upload()` delegate to these when `billingActive()`; the BYOK paths are untouched.

- [ ] **Step 1: Add vitest to `web/` and the test script**

```bash
cd web && npm install -D vitest && npm pkg set scripts.test="vitest run"
```

- [ ] **Step 2: Write the failing tests**

`web/src/lib/studio/plans.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { PLANS, creditsFor, previewOutcome } from "./plans";

describe("creditsFor", () => {
  it("matches the server multiplier", () => {
    expect(creditsFor(2, "480P")).toBe(2);
    expect(creditsFor(2, "768P")).toBe(4);
  });
});

describe("previewOutcome", () => {
  it("allows a film the wallet covers", () => {
    expect(previewOutcome("starter", 3, 2, "480P")).toEqual({ ok: true, cost: 2 });
  });
  it("suggests an upgrade past the plan cap", () => {
    expect(previewOutcome("starter", 9, 3, "480P")).toMatchObject({ ok: false, reason: "cap", upgrade: "family" });
    expect(previewOutcome("trial", 9, 2, "480P")).toMatchObject({ ok: false, reason: "cap", upgrade: "starter" });
  });
  it("suggests a top-up when only credits are short", () => {
    expect(previewOutcome("family", 1, 2, "480P")).toMatchObject({ ok: false, reason: "credits", upgrade: null });
    expect(previewOutcome("trial", 1, 1, "768P")).toMatchObject({ ok: false, reason: "credits" });
  });
  it("keeps the plan table in sync with the spec", () => {
    expect(PLANS.starter.credits).toBe(3);
    expect(PLANS.family.maxMinutes).toBe(5);
  });
});
```

`web/src/lib/studio/billing.test.ts`
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingActive, billingRun, registerDevice, startFilm } from "./billing";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("billing client", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("registers, starts a film and runs a proxied call to completion", async () => {
    const responses = [
      () => json({ token: "tok-1" }),
      () => json({ jobId: "job-1", cost: 1, creditsLeft: 0, watermark: true }),
      () => json({ request_id: "req-1" }),
      () => json({ status: "COMPLETED" }),
      () => json({ images: [{ url: "https://fal.media/x.png" }] }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!()));

    await registerDevice("dev-1", "idfv-1");
    expect(billingActive()).toBe(true);
    const job = await startFilm(1, "480P");
    expect(job.jobId).toBe("job-1");
    const out = await billingRun<{ images: { url: string }[] }>("openai/gpt-image-2.5/flare/text-to-image", { prompt: "x" });
    expect(out.images[0].url).toBe("https://fal.media/x.png");
  });

  it("surfaces plan refusals with status and reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "cap" }, 422)));
    await expect(startFilm(3, "480P")).rejects.toMatchObject({ status: 422, reason: "cap" });
  });
});
```

- [ ] **Step 3: Run the web tests to verify they fail**

```bash
cd web && npx vitest run src/lib/studio
```
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `web/src/lib/studio/plans.ts`**

```ts
export type Plan = "trial" | "starter" | "family";
export type Resolution = "480P" | "768P";

export const PLANS: Record<Plan, { credits: number; maxMinutes: number; rolloverCap: number }> = {
  trial: { credits: 1, maxMinutes: 1, rolloverCap: 0 },
  starter: { credits: 3, maxMinutes: 2, rolloverCap: 6 },
  family: { credits: 5, maxMinutes: 5, rolloverCap: 10 },
};

export const multiplier = (res: Resolution) => (res === "768P" ? 2 : 1);
export const creditsFor = (minutes: number, res: Resolution) => Math.ceil(minutes * multiplier(res));

export type PlanOutcome =
  | { ok: true; cost: number }
  | { ok: false; reason: "cap" | "credits"; cost: number; upgrade: Plan | null };

export function previewOutcome(plan: Plan, credits: number, minutes: number, res: Resolution): PlanOutcome {
  const cost = creditsFor(minutes, res);
  if (minutes > PLANS[plan].maxMinutes)
    return { ok: false, reason: "cap", cost, upgrade: plan === "trial" ? "starter" : plan === "starter" ? "family" : null };
  if (credits < cost) return { ok: false, reason: "credits", cost, upgrade: plan === "trial" ? "starter" : null };
  return { ok: true, cost };
}
```

- [ ] **Step 5: Implement `web/src/lib/studio/billing.ts`**

```ts
import type { Plan, Resolution } from "./plans";

const API = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BILLING_API ?? "";
const KEY = "storycast-billing";

type State = { token: string; jobId?: string };
let state: State | null = read();

function read(): State | null {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "null") as State | null;
  } catch {
    return null;
  }
}
function save() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export const billingActive = () => Boolean(state?.token);

export class BillingError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function call(path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(state ? { authorization: `Bearer ${state.token}` } : {}) },
  });
  if (r.status === 401) {
    state = null;
    save();
  }
  return r;
}

export async function registerDevice(device: string, idfv: string) {
  const r = await fetch(`${API}/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device, idfv }),
  });
  const b = (await r.json()) as { token?: string; error?: string };
  if (!r.ok || !b.token) throw new BillingError(r.status, b.error ?? "registration failed");
  state = { token: b.token };
  save();
}

export async function wallet(): Promise<{ plan: Plan; credits: number; maxMinutes: number }> {
  const r = await call("/wallet");
  const b = (await r.json()) as { plan: Plan; credits: number; maxMinutes: number };
  if (!r.ok) throw new BillingError(r.status, "wallet unavailable");
  return b;
}

export async function startFilm(minutes: number, resolution: Resolution) {
  const r = await call("/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ minutes, resolution }),
  });
  const b = (await r.json()) as { jobId?: string; cost: number; creditsLeft: number; watermark: boolean; error?: string };
  if (!r.ok || !b.jobId) throw new BillingError(r.status, b.error ?? "film refused", b.error);
  state = { ...state!, jobId: b.jobId };
  save();
  return { jobId: b.jobId, cost: b.cost, creditsLeft: b.creditsLeft, watermark: b.watermark };
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function billingRun<T>(app: string, input: Record<string, unknown>): Promise<T> {
  const jobId = state?.jobId;
  if (!jobId) throw new BillingError(409, "no film in production");
  const s = await call(`/jobs/${jobId}/calls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app, input }),
  });
  const submitted = (await s.json()) as { request_id?: string; error?: string };
  if (!s.ok || !submitted.request_id) throw new BillingError(s.status, `${app}: ${submitted.error ?? s.status}`);
  const rid = submitted.request_id;

  for (let i = 0; i < 40; i++) {
    const st = await call(`/jobs/${jobId}/calls/${rid}/status`);
    const body = (await st.json()) as { status?: string };
    if (body.status === "COMPLETED") break;
    if (body.status === "ERROR" || st.status >= 500) throw new BillingError(st.status, `${app}: request failed`);
    if (i === 39) throw new BillingError(504, `${app}: timed out`);
    await sleep(Math.min(15000, 1500 * (i + 1)));
  }

  const r = await call(`/jobs/${jobId}/calls/${rid}/result`);
  const out = await r.json();
  if (!r.ok) throw new BillingError(r.status, `${app}: result failed`);
  return out as T;
}

export async function billingUpload(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const r = await call("/upload", { method: "POST", body: form });
  const b = (await r.json()) as { url?: string; error?: string };
  if (!r.ok || !b.url) throw new BillingError(r.status, b.error ?? "upload failed");
  return b.url;
}

export async function settleFilm(outcome: "done" | "error", videoUrl?: string) {
  if (!state?.jobId) return;
  await call(`/jobs/${state.jobId}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outcome, videoUrl }),
  });
  state = { token: state.token };
  save();
}
```

- [ ] **Step 6: Route `fal.ts` through billing**

In `web/src/lib/studio/fal.ts`, add the import:
```ts
import { billingActive, billingRun, billingUpload } from "./billing";
```
At the top of `run` (currently line 140):
```ts
export async function run<T = any>(app: string, input: Record<string, unknown>, retries = 1): Promise<T> {
  if (billingActive()) return billingRun<T>(app, input);
```
At the top of `upload` (currently line 175):
```ts
export function upload(file: File): Promise<string> {
  if (billingActive()) return billingUpload(file);
```
Do not change the BYOK paths below these guards. `duration()` works unchanged because it calls `run()`.

- [ ] **Step 7: Add the parity guard**

`billing/test/parity.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { PLANS as serverPlans, creditsFor as serverCredits } from "../src/credits";
import { PLANS as clientPlans, creditsFor as clientCredits } from "../../web/src/lib/studio/plans";

describe("credit parity", () => {
  it("keeps client and server plan tables identical", () => {
    expect(clientPlans).toEqual(serverPlans);
  });
  it("agrees on credit math across the slider range", () => {
    for (const m of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) {
      for (const r of ["480P", "768P"] as const) {
        expect(clientCredits(m, r)).toBe(serverCredits(m, r));
      }
    }
  });
});
```

- [ ] **Step 8: Run both suites**

```bash
cd web && npx vitest run src/lib/studio && cd ../billing && npx vitest run test/parity.test.ts
```
Expected: PASS in both.

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/package-lock.json web/src/lib/studio/plans.ts web/src/lib/studio/plans.test.ts web/src/lib/studio/billing.ts web/src/lib/studio/billing.test.ts web/src/lib/studio/fal.ts billing/test/parity.test.ts
git commit -m "Add client billing lib, plan preview and fal billing routing"
```

---

### Task 12: Smoke script, runbook, end-to-end verification

**Files:**
- Create: `billing/scripts/smoke.mjs`
- Create: `billing/README.md`

- [ ] **Step 1: Write the smoke script**

`billing/scripts/smoke.mjs`
```js
const BASE = process.env.BILLING_URL ?? "http://127.0.0.1:8787";
const ok = (cond, msg) => {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
  console.log("ok  ", msg);
};
const j = async (r) => ({ status: r.status, body: await r.json() });
const device = `smoke-${Date.now()}`;

ok((await j(await fetch(`${BASE}/health`))).body.ok === true, "health");

const reg = await j(
  await fetch(`${BASE}/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device, idfv: device }),
  }),
);
ok(reg.status === 200 && reg.body.token, "accounts register");

const auth = { authorization: `Bearer ${reg.body.token}`, "content-type": "application/json" };

const w1 = await j(await fetch(`${BASE}/wallet`, { headers: auth }));
ok(w1.body.plan === "trial" && w1.body.credits === 1, "trial wallet has 1 credit");

const job = await j(
  await fetch(`${BASE}/jobs`, { method: "POST", headers: auth, body: JSON.stringify({ minutes: 1, resolution: "480P" }) }),
);
ok(job.status === 200 && job.body.cost === 1, "trial film starts and debits 1 credit");

const second = await j(
  await fetch(`${BASE}/jobs`, { method: "POST", headers: auth, body: JSON.stringify({ minutes: 1, resolution: "480P" }) }),
);
ok(second.status === 402, "second film refused without credits");

const settle = await j(
  await fetch(`${BASE}/jobs/${job.body.jobId}/settle`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ outcome: "error" }),
  }),
);
ok(settle.status === 200 && settle.body.refund === 1, "failed job refunds its credit");

const w2 = await j(await fetch(`${BASE}/wallet`, { headers: auth }));
ok(w2.body.credits === 1, "wallet restored after refund");

console.log("smoke passed");
```

- [ ] **Step 2: Write the runbook**

`billing/README.md`
```md
# Storycast billing

Credits, plans, App Store subscriptions and the fal proxy for the managed-compute iOS app.
Design: `docs/superpowers/specs/2026-11-20-storycast-ios-pricing-design.md`

## Plans

| Plan | Allowance | Cap |
|---|---|---|
| trial | 1 credit once | 1 min, 480P only |
| starter | 3 credits/mo | 2 min/film |
| family | 5 credits/mo shared | 5 min/film |

1 credit = 1 film-minute at 480P; 768P costs 2 credits/min. Unused plan credits roll one month, up to 2x the allowance.

## Setup

```bash
npm install
npx wrangler d1 create storycast-billing        # paste database_id into wrangler.jsonc
npx wrangler d1 execute storycast-billing --remote --file schema.sql
npx wrangler secret put FAL_KEY                 # server-side fal key; never shipped in apps
npx wrangler secret put HASH_SALT               # random 32+ chars
npx wrangler secret put APPLE_ISSUER            # App Store Connect issuer id
npx wrangler secret put APPLE_KEY_ID            # .p8 key id
npx wrangler secret put APPLE_PRIVATE_KEY       # .p8 contents
npx wrangler secret put APPLE_BUNDLE_ID         # com.storycast.app
```

Products: `com.storycast.starter.monthly|yearly`, `com.storycast.family.monthly|yearly`, `com.storycast.topup.1|3`.

## Develop

```bash
npm run dev          # wrangler dev on http://127.0.0.1:8787
npm test             # vitest-pool-workers
node scripts/smoke.mjs
```

## Deploy

```bash
npx wrangler deploy
```

Point the App Store Server Notifications URL at `https://<worker-host>/apple/notifications` (Sandbox and Production).

## Launch gate

Subscriptions go live only when COGS <= $2.75 per 480P minute (spec section 4).
```

- [ ] **Step 3: Run the end-to-end verification**

```bash
cd billing && npm test
```
Expected: PASS (all suites).

```bash
cd billing && npx wrangler dev --local
```
Expected: dev server on `http://127.0.0.1:8787`. In a second terminal:
```bash
cd billing && node scripts/smoke.mjs
```
Expected: 7 `ok` lines and `smoke passed`.

```bash
cd web && npx vitest run src/lib/studio && npm run lint && npx tsc -b
```
Expected: tests pass, lint clean, types clean.

- [ ] **Step 4: Commit**

```bash
git add billing/scripts/smoke.mjs billing/README.md
git commit -m "Add billing runbook and end-to-end smoke script"
```

---

## Follow-up Plans (not part of this plan)

- **Plan B — Cost program:** eval harness comparing H3 Max vs H3 Lite vs Grok Lite on 20 identical clips (consistency A/B), direct ElevenLabs TTS/Music, OpenRouter-direct LLM routing. Gates the launch prices in spec section 4.
- **Plan C — iOS shell:** Expo/RN app shell, StoreKit 2 purchase + restore flows, parental gate, paywall screens from `/flow-mobile`, consuming `web/src/lib/studio/billing.ts` (the module is platform-neutral and importable from the RN app).
- **Plan A2 — reconciliation & ops:** nightly Cron Trigger comparing wallets against App Store Server API history (spec section 8), REFUND clawback policy, and analytics events for the spec section 9 metrics.
- **Watermark rendering:** banner flag already returned by `POST /jobs`; the overlay itself ships with the iOS compose step in Plan C.
