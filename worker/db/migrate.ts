/**
 * Additive migrations for Durable Objects created before a column existed.
 * schema.sql uses CREATE TABLE IF NOT EXISTS, which does NOT alter an existing
 * table — so every column added after first boot needs an entry here.
 *
 * Forward-only, idempotent, cheap. Runs on every DO boot after schema.sql.
 */

function addColumn(sql: SqlStorage, table: string, column: string, decl: string): void {
  try {
    sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  } catch (e) {
    // "duplicate column name" — already migrated. Anything else re-throws.
    if (!String((e as Error).message).includes("duplicate column")) throw e;
  }
}

export function migrate(sql: SqlStorage): void {
  // A migration failure must NEVER stop the DO from booting — a half-applied
  // schema is recoverable, a DO that throws in blockConcurrencyWhile looks
  // exactly like total data loss. Each step is isolated and best-effort.
  try {
    // taste_signals.supersedes — bitemporal correction pointer (2026-08-31).
    addColumn(sql, "taste_signals", "supersedes", "TEXT");
    // accesses.why / .applied_signal_ids — retrieval provenance (2026-08-31).
    addColumn(sql, "accesses", "why", "TEXT");
    addColumn(sql, "accesses", "applied_signal_ids", "TEXT NOT NULL DEFAULT '[]'");
  } catch (e) {
    console.error("migrate: addColumn failed", e);
  }
  try {
    purgeSeedData(sql);
  } catch (e) {
    console.error("migrate: purgeSeedData failed", e);
  }
  try {
    backfillUsage(sql);
  } catch (e) {
    console.error("migrate: backfillUsage failed", e);
  }
}

/**
 * Older builds seeded every new space with a fake "Atlas rebrand" demo round
 * (items, edges, an artifact + review, agent sessions, taste signals). The
 * seeding is gone from the code; this removes what it already wrote so a space
 * comes back empty, the way a fresh sign-in now produces it.
 *
 * A space is "seeded" if it holds items titled both "Atlas rebrand — creative
 * brief" and "Terracotta palette reference" — a fingerprint a real archive
 * would never reproduce by accident. Such a space is wiped whole (its regions
 * and the space row included); bootstrap recreates it with empty folders. The
 * owner's beta slot is left alone. Idempotent: no seeded space, no-op.
 */
function purgeSeedData(sql: SqlStorage): void {
  const seeded = sql
    .exec<{ space_id: string }>(
      `SELECT space_id FROM items WHERE title = 'Atlas rebrand — creative brief'
       INTERSECT
       SELECT space_id FROM items WHERE title = 'Terracotta palette reference'`,
    )
    .toArray()
    .map((r) => r.space_id);

  for (const s of seeded) {
    const d = (stmt: string) => sql.exec(stmt, s);
    d(`DELETE FROM taste_events   WHERE signal_id IN (SELECT id FROM taste_signals WHERE space_id = ?)`);
    d(`DELETE FROM taste_evidence WHERE signal_id IN (SELECT id FROM taste_signals WHERE space_id = ?)`);
    d(`DELETE FROM taste_signals  WHERE space_id = ?`);
    d(`DELETE FROM decisions   WHERE version_id IN (SELECT av.id FROM artifact_versions av JOIN artifacts a ON a.id = av.artifact_id WHERE a.space_id = ?)`);
    d(`DELETE FROM annotations WHERE version_id IN (SELECT av.id FROM artifact_versions av JOIN artifacts a ON a.id = av.artifact_id WHERE a.space_id = ?)`);
    d(`DELETE FROM influences  WHERE version_id IN (SELECT av.id FROM artifact_versions av JOIN artifacts a ON a.id = av.artifact_id WHERE a.space_id = ?)`);
    d(`DELETE FROM artifact_versions WHERE artifact_id IN (SELECT id FROM artifacts WHERE space_id = ?)`);
    d(`DELETE FROM artifacts   WHERE space_id = ?`);
    d(`DELETE FROM accesses WHERE task_id IN (SELECT id FROM tasks WHERE space_id = ?)`);
    d(`DELETE FROM denials  WHERE task_id IN (SELECT id FROM tasks WHERE space_id = ?)`);
    d(`DELETE FROM grants   WHERE space_id = ?`);
    d(`DELETE FROM audit_events   WHERE task_id IN (SELECT id FROM tasks WHERE space_id = ?)`);
    d(`DELETE FROM agent_sessions WHERE task_id IN (SELECT id FROM tasks WHERE space_id = ?)`);
    d(`DELETE FROM tasks    WHERE space_id = ?`);
    sql.exec(
      `DELETE FROM edges WHERE from_id IN (SELECT id FROM items WHERE space_id = ?) OR to_id IN (SELECT id FROM items WHERE space_id = ?)`,
      s,
      s,
    );
    d(`DELETE FROM item_notes WHERE space_id = ?`);
    d(`DELETE FROM items    WHERE space_id = ?`);
    d(`DELETE FROM regions  WHERE space_id = ?`);
    d(`DELETE FROM usage_counters WHERE human_id IN (SELECT owner_id FROM spaces WHERE id = ?)`);
    d(`DELETE FROM spaces   WHERE id = ?`);
    console.log("migrate: purged seeded space", s);
  }
}

/**
 * Metering started after these tables were already recording work, so a member's
 * quota bars would read 0 despite a history of activity. Seed this month's
 * counters from the provenance we DO have.
 *
 * Three metrics can be reconstructed:
 *   - artifacts   : exact — one artifact_versions row per record_artifact call.
 *   - uploads     : exact — every items.content_ref is an R2 object key written
 *                   by /api/upload (seed images included; they're real R2 usage).
 *   - agent_calls : estimated — distinct access timestamps (a retrieval writes
 *                   many accesses, all at the same ms) plus agent artifact
 *                   versions. An undercount (taste/scope reads write nothing),
 *                   but far better than 0.
 * (uploads and artifacts are exact; agent_calls is an estimate.)
 *
 * Reconciled with `used = MAX(existing, reconstructed)` rather than left alone:
 * uploads/artifacts counts ARE the true totals, so if a member's live counter is
 * lower it was missing history; if it's already higher, real usage has outpaced
 * the reconstruction and wins. Current month only — a monthly-resetting quota
 * can't be affected by older activity. Idempotent across boots.
 */
function backfillUsage(sql: SqlStorage): void {
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  const inMonth = (col: string) => `strftime('%Y-%m', ${col} / 1000, 'unixepoch') = ?`;

  const seed = (metric: string, selectExpr: string, ...bind: string[]) =>
    sql.exec(
      `INSERT INTO usage_counters (human_id, period, metric, used) ${selectExpr}
       ON CONFLICT (human_id, period, metric)
       DO UPDATE SET used = MAX(usage_counters.used, excluded.used)`,
      ...bind,
    );

  // uploads — exact: every items.content_ref is one R2 object.
  seed(
    "uploads",
    `SELECT s.owner_id, ?, 'uploads', COUNT(*)
     FROM items i JOIN spaces s ON s.id = i.space_id
     WHERE i.content_ref IS NOT NULL AND ${inMonth("i.created_at")}
     GROUP BY s.owner_id`,
    period,
    period,
  );

  // artifacts — exact: one artifact_versions row per record_artifact call.
  seed(
    "artifacts",
    `SELECT s.owner_id, ?, 'artifacts', COUNT(*)
     FROM artifact_versions av
     JOIN artifacts a ON a.id = av.artifact_id
     JOIN spaces s ON s.id = a.space_id
     WHERE av.agent_session_id IS NOT NULL AND ${inMonth("av.created_at")}
     GROUP BY s.owner_id`,
    period,
    period,
  );

  // agent_calls — estimate: distinct access timestamps (a retrieval writes many
  // accesses at one ms) plus agent artifact versions. Undercounts; better than 0.
  seed(
    "agent_calls",
    `SELECT owner_id, ?, 'agent_calls', SUM(n) FROM (
       SELECT s.owner_id AS owner_id, COUNT(DISTINCT ac.at) AS n
       FROM accesses ac
       JOIN tasks t ON t.id = ac.task_id
       JOIN spaces s ON s.id = t.space_id
       WHERE ${inMonth("ac.at")}
       GROUP BY s.owner_id
       UNION ALL
       SELECT s.owner_id AS owner_id, COUNT(*) AS n
       FROM artifact_versions av
       JOIN artifacts a ON a.id = av.artifact_id
       JOIN spaces s ON s.id = a.space_id
       WHERE av.agent_session_id IS NOT NULL AND ${inMonth("av.created_at")}
       GROUP BY s.owner_id
     ) GROUP BY owner_id`,
    period,
    period,
    period,
  );
}
