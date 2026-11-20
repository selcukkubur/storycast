import type { AppleVerifier } from "./apple";
import type { Plan } from "./credits";
import { grantMonth } from "./grants";

type Db = { DB: D1Database };

export type ReconcileSummary = { checked: number; renewed: number; downgraded: number; failed: number };

/**
 * Nightly repair pass for subscription state: re-reads every account with a stored
 * original transaction id from the App Store and applies what webhooks may have missed.
 * Grant re-application is idempotent through the ledger's monthly ref.
 */
export async function reconcile(env: Db, verifier: AppleVerifier): Promise<ReconcileSummary> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const { results } = await env.DB.prepare("SELECT id, orig_txn FROM accounts WHERE orig_txn != ''").all<{
    id: string;
    orig_txn: string;
  }>();

  const summary: ReconcileSummary = { checked: 0, renewed: 0, downgraded: 0, failed: 0 };
  for (const account of results ?? []) {
    summary.checked += 1;
    try {
      const sub = await verifier.subscription(account.orig_txn);
      const active = !sub.revoked && sub.expiresAt > nowSeconds;
      if (active) {
        await env.DB.prepare("UPDATE accounts SET plan = ?, expires_at = ? WHERE id = ?")
          .bind(sub.plan satisfies Plan, sub.expiresAt, account.id)
          .run();
        await grantMonth(env, account.id, sub.plan);
        summary.renewed += 1;
      } else {
        await env.DB.prepare("UPDATE accounts SET plan = 'trial', expires_at = 0 WHERE id = ?").bind(account.id).run();
        summary.downgraded += 1;
      }
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
