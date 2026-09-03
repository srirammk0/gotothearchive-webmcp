/**
 * Closed beta: a hard cap of 25 members and a per-member monthly quota, sized so
 * all 25 combined stay inside the Cloudflare Workers **Free** plan. No paid plan,
 * no $5 base fee.
 *
 * Not quite $0 anymore: `@cf/meta/llama-3.2-11b-vision-instruct` (design
 * extraction, worker/design.ts) is the one Workers AI call in the system and the
 * one line item that can bill — Workers AI gives a free daily Neuron allowance
 * and charges past it. The `vision_calls` metric below is what keeps 25 members
 * inside that allowance — see `VISION_CALLS_LIMIT` for the budget it is derived
 * from, and for the one term in it that is still an estimate.
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
 * ── Recalc, 2026-09-01 (projects) ─────────────────
 *  - Cloudflare row-write budget: still fine. New per-mutation writes are small
 *    and human-paced — a `projects`/`project_members` row on demand, bounded by
 *    the `uploads` cap. The one real regression was `migrate()` rebuilding items_fts
 *    on EVERY boot (~1 write/item/boot); that is now version-gated in SpaceDO
 *    (FTS_REBUILD_VERSION), so a cold boot writes nothing unless the marker is
 *    stale. No QUOTA change needed.
 */
export const BETA_MAX_USERS = 25;

/**
 * One vision call runs per image capture and per backfill item
 * (`@cf/meta/llama-3.2-11b-vision-instruct`).
 *
 * Derived, with one term still estimated:
 *   - free allowance: **10,000 Neurons/day**, read off the Cloudflare dashboard
 *     2026-09-02. ≈300,000/month.
 *   - ÷ BETA_MAX_USERS ⇒ ~12,000 Neurons per member per month.
 *   - cost of one call: **not measured.** Workers AI list pricing puts an
 *     11b-vision call on a single image near 20-30 Neurons. 120 is sized so the
 *     cap still holds if that estimate is 4-5x low (~100/call).
 *
 * So the budget is real and the per-call figure is the soft term. To pin it:
 * capture one image, re-read Workers AI → Usage, divide the delta by the calls
 * made, then set this to `floor(12_000 / neuronsPerCall)`.
 *
 * Note the allowance is *daily* and does not bank, so a burst matters as much as
 * the monthly total — `BACKFILL_BATCH = 4` per alarm is what bounds the burst.
 */
export const VISION_CALLS_LIMIT = 120;

export const QUOTA = {
  /** POST /api/mcp/call — one per agent tool call. ~25 DO reqs + a handful of rows each. */
  agent_calls: 600,
  /** POST /api/upload — one R2 Class A op + storage. Pair with UPLOAD_MAX_BYTES. */
  uploads: 60,
  /** record_artifact tool — a new artifact version row. */
  artifacts: 100,
  /** Workers AI vision call (design extraction). The only real Workers AI spend. */
  vision_calls: VISION_CALLS_LIMIT,
} as const;

export type QuotaMetric = keyof typeof QUOTA;

export const QUOTA_METRICS = Object.keys(QUOTA) as QuotaMetric[];

/**
 * A judge's disposable `kind: 'guest'` space (docs/roadmap/judge-demo-access.md).
 * Sized for one full demo run and no more, and counted separately from the beta
 * cap. `uploads: 0` and `vision_calls: 0` are load-bearing: with both at zero a
 * guest can never reach the R2 write path or the Workers AI vision path, so the
 * only billable line item in the system is closed to guests entirely.
 */
export const GUEST_QUOTA: Record<QuotaMetric, number> = {
  agent_calls: 40,
  uploads: 0,
  artifacts: 5,
  vision_calls: 0,
};

/** The limit table a space meters against — guests get the smaller GUEST_QUOTA. */
export function quotaLimits(spaceKind: string | undefined): Record<QuotaMetric, number> {
  return spaceKind === "guest" ? GUEST_QUOTA : QUOTA;
}

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
  limits: Record<QuotaMetric, number> = QUOTA,
): QuotaCheck {
  const period = quotaPeriod();
  const used = store.usageGet(humanId, period, metric);
  if (used + cost > limits[metric]) {
    return {
      ok: false,
      error: "quota_exceeded",
      metric,
      limit: limits[metric],
      message: `Beta quota reached for "${metric}" this month (${limits[metric]}). Resets on the 1st.`,
    };
  }
  store.usageAdd(humanId, period, metric, cost);
  return { ok: true };
}
