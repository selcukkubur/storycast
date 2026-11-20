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
      const r = await fetch(`${host}/inApps/v2/transactions/${encodeURIComponent(transactionId)}`, {
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
