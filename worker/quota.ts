/**
 * Closed beta: a hard cap of 25 members and a per-member monthly quota, sized so
 * all 25 combined stay inside the Cloudflare Workers **Free** plan. No paid plan,
 * no $5 base fee — the whole deployment costs $0.
 *
 * Free-plan ceilings that matter here (account-wide, and mostly *daily*), with
 * the 25-member share:
 *
 *   Workers requests / day       100,000   →   4,000 / user / day
 *   DO SQLite rows written / day  100,000   →   4,000 / user / day   ← tightest
 *   DO SQLite rows read / day   1,250,000   →  50,000 / user / day
 *   DO storage (total)                5 GB   →     200 MB / user
 *   R2 Class A ops / month     1,000,000   →  40,000 / user / month
 *   R2 storage                     10 GB   →     400 MB / user
 *
 * The monthly caps below are far under the daily lines even if every member is
 * active on the same day: 25 × 600 agent calls ≈ 15k calls/mo ≈ 500/day, and at
 * ~10 row writes per call that is ~5k writes/day against the 100k/day ceiling.
 * The free plan throttles rather than bills when a ceiling is hit, so there is
 * no cost risk — only a (very unlikely) burst-day slowdown.
 *
 * Requires SQLite-backed Durable Objects (wrangler `new_sqlite_classes`) — the
 * only DO kind the free plan allows. This project already uses that.
 *
 * ── Recalc, 2026-09-01 (projects + Supermemory augmentation) ─────────────────
 *  - Cloudflare row-write budget: still fine. New per-mutation writes are small
 *    and human-paced — a `projects`/`project_members` row on demand, one
 *    `memory_outbox` row + one status update per item write (bounded by the
 *    `uploads` cap). The one real regression was `migrate()` rebuilding items_fts
 *    on EVERY boot (~1 write/item/boot); that is now version-gated in SpaceDO
 *    (FTS_REBUILD_VERSION), so a cold boot writes nothing unless the marker is
 *    stale. No QUOTA change needed.
 *  - Supermemory is OFF the Cloudflare bill entirely (external SaaS). Its own
 *    free tier is the new ceiling to watch, NOT a hard failure:
 *      • ~10k searches/mo — only `get_context_for_task` calls search; at ~half of
 *        25×600 agent_calls that is ~7.5k/mo. On a 429 the adapter returns null
 *        and retrieval silently drops to FTS+recency+graph.
 *      • ~1M tokens/mo ingested — item text is short (title + derived body), but
 *        edits re-send. If this ceiling bites, ingestion just stalls in the
 *        outbox; retrieval still works, items are FTS-searchable immediately.
 *    Unsetting SUPERMEMORY_API_KEY reverts to pure-SQLite retrieval with no code
 *    change (mirrorMemory + the retrieve() list-D path both no-op).
 */
export const BETA_MAX_USERS = 25;

export const QUOTA = {
  /** POST /api/mcp/call — one per agent tool call. ~25 DO reqs + a handful of rows each. */
  agent_calls: 600,
  /** POST /api/upload — one R2 Class A op + storage. Pair with UPLOAD_MAX_BYTES. */
  uploads: 60,
  /** record_artifact tool — a new artifact version row. */
  artifacts: 100,
} as const;

export type QuotaMetric = keyof typeof QUOTA;

export const QUOTA_METRICS = Object.keys(QUOTA) as QuotaMetric[];

/** 6 MB per upload → 60 uploads ≈ 360 MB, under the 400 MB/user R2 budget. */
export const UPLOAD_MAX_BYTES = 6 * 1024 * 1024;

/** Calendar-month bucket key, e.g. "2026-08". Quotas reset at the month boundary. */
export function quotaPeriod(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7);
}

/** Minimal surface `consumeQuota` needs — avoids importing the whole Queries type. */
export interface QuotaStore {
  usageGet(humanId: string, period: string, metric: string): number;
  usageAdd(humanId: string, period: string, metric: string, n: number): void;
}

export type QuotaCheck =
  | { ok: true }
  | { ok: false; error: "quota_exceeded"; metric: QuotaMetric; limit: number; message: string };

/**
 * Check-and-consume `cost` units of a monthly metric. On success the counter is
 * incremented and `{ ok: true }` returned; over budget, nothing is written and
 * the caller turns the result into a 429 (HTTP) or a tool denial.
 */
export function consumeQuota(
  store: QuotaStore,
  humanId: string,
  metric: QuotaMetric,
  cost = 1,
): QuotaCheck {
  const period = quotaPeriod();
  const used = store.usageGet(humanId, period, metric);
  if (used + cost > QUOTA[metric]) {
    return {
      ok: false,
      error: "quota_exceeded",
      metric,
      limit: QUOTA[metric],
      message: `Beta quota reached for "${metric}" this month (${QUOTA[metric]}). Resets on the 1st.`,
    };
  }
  store.usageAdd(humanId, period, metric, cost);
  return { ok: true };
}
