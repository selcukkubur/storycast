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

export async function falMetadata(env: Env, mediaUrl: string) {
  const text = await falFetch(env, "https://fal.run/fal-ai/ffmpeg-api/metadata", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ media_url: mediaUrl }),
  });
  const body = JSON.parse(text) as { media?: { duration?: unknown } };
  const duration = Number(body.media?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new HttpError(502, "metadata returned no duration");
  return { duration };
}

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
