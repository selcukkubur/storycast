import { BillingError, billingRun, billingUpload } from "@/src/lib/billing";

export class FalError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export const isKeyError = (e: unknown) => e instanceof FalError && (e.status === 401 || e.status === 403);

/** Six calls in flight, same as web: the pipeline fans out per beat and bursts trip the proxy. */
class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private readonly limit: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }
  release(): void {
    this.active--;
    this.queue.shift()?.();
  }
}
const sem = new Semaphore(6);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** A dropped connection, a rate limit or a gateway hiccup is worth another attempt; a 4xx is not. */
const RETRYABLE = new Set([0, 429, 503, 504]);
const retryable = (e: unknown) =>
  e instanceof FalError && e.status !== undefined && RETRYABLE.has(e.status);

export async function run<T = any>(app: string, input: Record<string, unknown>, retries = 1): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await sem.acquire();
    try {
      return await billingRun<T>(app, input);
    } catch (e) {
      // BillingError → FalError keeps the status the caller inspects (401/403 = key problem).
      const err = e instanceof BillingError ? new FalError(e.message, e.status) : e;
      if (!retryable(err) || attempt >= retries) throw err;
    } finally {
      sem.release();
    }
    await sleep(1500 * (attempt + 1));
  }
}

export async function duration(url: string): Promise<number> {
  const r = await run<{ media: { duration: number } }>("fal-ai/ffmpeg-api/metadata", { media_url: url });
  return Number(r.media.duration);
}

export async function upload(file: { uri: string; name: string; type: string }): Promise<string> {
  return billingUpload(file);
}
