import type { Plan, Resolution } from "./plans";

const API = (import.meta.env.VITE_BILLING_API as string | undefined) ?? "";
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
    if (!st.ok) throw new BillingError(st.status, `${app}: status ${st.status}`);
    const body = (await st.json()) as { status?: string };
    if (body.status === "COMPLETED") break;
    if (body.status === "ERROR") throw new BillingError(st.status, `${app}: request failed`);
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
  state = state ? { token: state.token } : null;
  save();
}
