import * as SecureStore from "expo-secure-store";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";

const TOKEN_KEY = "storycast.billing.token";
const DEVICE_KEY = "storycast.device.id";

export class BillingError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

let token: string | null = null;
let jobId: string | null = null;
let registering: Promise<void> | null = null;

export const billingActive = () => Boolean(token);

/**
 * Restores the session token from the keychain. Every call is a real keychain
 * read, so this is a once-per-app-start (or once-per-flow) operation: T9 must
 * not call it per render.
 */
export async function initBilling(): Promise<void> {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
}

async function setToken(next: string | null) {
  token = next;
  if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

function api(): string {
  const base = process.env.EXPO_PUBLIC_BILLING_API ?? "";
  if (!base) throw new BillingError(0, "EXPO_PUBLIC_BILLING_API is not set");
  return base;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${api()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  if (r.status === 401) await setToken(null);
  return r;
}

/** Error bodies are not always JSON (proxies, gateways); never let a parse failure mask the status. */
async function readJson<T>(r: Response): Promise<T> {
  return (await r.json().catch(() => ({}))) as T;
}

export async function ensureDeviceId(): Promise<{ device: string; idfv: string }> {
  let device = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!device) {
    device = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_KEY, device);
  }
  const idfv = (await Application.getIosIdForVendorAsync()) ?? device;
  return { device, idfv };
}

export async function registerDevice(device: string, idfv: string): Promise<void> {
  const r = await fetch(`${api()}/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device, idfv }),
  });
  const b = await readJson<{ token?: string; error?: string }>(r);
  if (r.status === 409) throw new BillingError(409, "device already registered");
  if (!r.ok || !b.token) throw new BillingError(r.status, b.error ?? "registration failed");
  await setToken(b.token);
}

export async function ensureDevice(device: string, idfv: string): Promise<void> {
  await initBilling();
  if (token) return;
  // Two concurrent callers must share one registration: the loser would 409.
  registering ??= registerDevice(device, idfv).finally(() => {
    registering = null;
  });
  await registering;
}

export async function wallet(): Promise<{ plan: string; credits: number; maxMinutes: number }> {
  const r = await call("/wallet");
  const b = await readJson<{ plan: string; credits: number; maxMinutes: number }>(r);
  if (!r.ok) throw new BillingError(r.status, "wallet unavailable");
  return b;
}

export async function startFilm(minutes: number, resolution: "480P" | "768P") {
  // A failed second film must not leave the previous job adoptable/settleable.
  jobId = null;
  const r = await call("/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ minutes, resolution }),
  });
  const b = await readJson<{ jobId?: string; cost: number; creditsLeft: number; watermark: boolean; error?: string }>(r);
  if (!r.ok || !b.jobId) throw new BillingError(r.status, b.error ?? "film refused", b.error);
  jobId = b.jobId;
  return { jobId: b.jobId, cost: b.cost, creditsLeft: b.creditsLeft, watermark: b.watermark };
}

export function adoptJob(id: string) {
  jobId = id;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function billingRun<T>(app: string, input: Record<string, unknown>): Promise<T> {
  if (!jobId) throw new BillingError(409, "no film in production");
  const s = await call(`/jobs/${jobId}/calls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app, input }),
  });
  const sub = await readJson<{ request_id?: string; error?: string }>(s);
  if (!s.ok || !sub.request_id) throw new BillingError(s.status, `${app}: ${sub.error ?? s.status}`, sub.error);
  const rid = sub.request_id;
  for (let i = 0; i < 40; i++) {
    const st = await call(`/jobs/${jobId}/calls/${rid}/status`);
    if (!st.ok) throw new BillingError(st.status, `${app}: status ${st.status}`);
    const body = await readJson<{ status?: string }>(st);
    if (body.status === "COMPLETED") break;
    if (body.status === "ERROR") throw new BillingError(500, `${app}: request failed`);
    if (i === 39) throw new BillingError(504, `${app}: timed out`);
    await sleep(Math.min(15000, 1500 * (i + 1)));
  }
  const r = await call(`/jobs/${jobId}/calls/${rid}/result`);
  if (!r.ok) throw new BillingError(r.status, `${app}: result failed`);
  return readJson<T>(r);
}

export async function billingUpload(file: { uri: string; name: string; type: string }): Promise<string> {
  const form = new FormData();
  form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  const r = await call("/upload", { method: "POST", body: form });
  const b = await readJson<{ url?: string; error?: string }>(r);
  if (!r.ok || !b.url) throw new BillingError(r.status, b.error ?? "upload failed");
  return b.url;
}

/**
 * Settles the open job. `jobId` is only released on a 2xx response, so the
 * caller can retry the same settle (spec §6: up to 3 attempts) after a
 * network/5xx failure instead of orphaning the debit and locking the pool
 * until RUNNING_JOB_TTL.
 */
export async function settleFilm(
  outcome: "done" | "error",
  videoUrl?: string,
): Promise<{ ok: boolean; status: number; refund: number; creditsLeft?: number }> {
  if (!jobId) return { ok: true, status: 0, refund: 0, creditsLeft: undefined };
  let r: Response;
  try {
    r = await call(`/jobs/${jobId}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome, videoUrl }),
    });
  } catch {
    return { ok: false, status: 0, refund: 0 };
  }
  const b = await readJson<{ refund?: number; creditsLeft?: number }>(r);
  if (r.ok) jobId = null;
  return { ok: r.ok, status: r.status, refund: b.refund ?? 0, creditsLeft: b.creditsLeft };
}

export async function devTopUp(credits: number, devToken: string): Promise<{ creditsLeft: number }> {
  const r = await call("/dev/credits", {
    method: "POST",
    headers: { "content-type": "application/json", "x-dev-token": devToken },
    body: JSON.stringify({ credits }),
  });
  const b = await readJson<{ creditsLeft?: number; error?: string }>(r);
  if (!r.ok) throw new BillingError(r.status, b.error ?? "top-up failed");
  return { creditsLeft: b.creditsLeft ?? 0 };
}
