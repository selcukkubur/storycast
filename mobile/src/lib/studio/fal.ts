import { BillingError, billingRun, billingUpload } from "@/src/lib/billing";

export class FalError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export const isKeyError = (e: unknown) => e instanceof FalError && (e.status === 401 || e.status === 403);

export async function run<T = any>(app: string, input: Record<string, unknown>, _retries = 1): Promise<T> {
  try {
    return await billingRun<T>(app, input);
  } catch (e) {
    if (e instanceof BillingError) throw new FalError(e.message, e.status);
    throw e;
  }
}

export async function duration(url: string): Promise<number> {
  const r = await run<{ media: { duration: number } }>("fal-ai/ffmpeg-api/metadata", { media_url: url });
  return Number(r.media.duration);
}

export async function upload(file: { uri: string; name: string; type: string }): Promise<string> {
  return billingUpload(file);
}
