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
