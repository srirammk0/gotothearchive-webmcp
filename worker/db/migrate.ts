/**
 * Additive migrations for Durable Objects created before a column existed.
 * schema.sql uses CREATE TABLE IF NOT EXISTS, which does NOT alter an existing
 * table — so every column added after first boot needs an entry here.
 *
 * Forward-only, idempotent, cheap. Runs on every DO boot after schema.sql.
 */
import { rowidFor } from "./queries";

function addColumn(sql: SqlStorage, table: string, column: string, decl: string): void {
  try {
    sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  } catch (e) {
    // "duplicate column name" — already migrated. Anything else re-throws.
    if (!String((e as Error).message).includes("duplicate column")) throw e;
  }
}

const inMonth = (column: string) => `strftime('%Y-%m', ${column} / 1000, 'unixepoch') = ?`;

/** Recreate the derived FTS index solely from canonical item rows. */
export function rebuildFts(sql: SqlStorage): void {
  sql.exec(`DROP TABLE IF EXISTS items_fts`);
  sql.exec(`CREATE VIRTUAL TABLE items_fts USING fts5(title, semantic_text, content='')`);
  const items = sql
    .exec<{ id: string; title: string; semantic_text: string | null }>(
      `SELECT id, title, semantic_text FROM items`,
    )
    .toArray();
  for (const item of items) {
    sql.exec(
      `INSERT INTO items_fts (rowid, title, semantic_text) VALUES (?, ?, ?)`,
      rowidFor(item.id),
      item.title,
      item.semantic_text ?? "",
    );
  }
}

/**
 * Widen `taste_signals.created_by` to accept 'agent'.
 *
 * An agent naming a preference it noticed is a different act from the
 * derivation loop finding one in the person's own annotations, and the Taste UI
 * labels them differently — so it needs its own value rather than being filed
 * as 'system'. SQLite has no ALTER for a CHECK constraint; the only way is to
 * rebuild. Idempotent: the probe below short-circuits once the constraint is
 * already wide enough, so this costs nothing on subsequent boots.
 */
function widenTasteSignalCreatedBy(sql: SqlStorage): void {
  try {
    sql.exec(`SAVEPOINT probe_created_by`);
    try {
      sql.exec(
        `INSERT INTO taste_signals (id, space_id, owner_id, statement, created_by, created_at)
         VALUES ('__probe__', NULL, '', '', 'agent', 0)`,
      );
    } finally {
      sql.exec(`ROLLBACK TO probe_created_by`);
      sql.exec(`RELEASE probe_created_by`);
    }
    return; // constraint already permits 'agent'
  } catch (e) {
    const message = String((e as Error).message);
    // Anything other than the CHECK we are trying to widen is not ours to fix.
    if (!message.includes("CHECK constraint failed")) return;
  }

  sql.exec(`ALTER TABLE taste_signals RENAME TO taste_signals_old`);
  sql.exec(`CREATE TABLE taste_signals (
    id          TEXT PRIMARY KEY,
    space_id    TEXT NOT NULL REFERENCES spaces(id),
    project_id  TEXT REFERENCES projects(id),
    owner_id    TEXT NOT NULL,
    statement   TEXT NOT NULL,
    dimensions  TEXT NOT NULL DEFAULT '[]',
    scope       TEXT NOT NULL DEFAULT 'personal',
    status      TEXT NOT NULL DEFAULT 'proposed'
                CHECK (status IN ('proposed','confirmed','rejected','superseded')),
    confidence  REAL NOT NULL DEFAULT 0.5,
    created_by  TEXT NOT NULL CHECK (created_by IN ('system','human','agent')),
    approved_by TEXT,
    created_at  INTEGER NOT NULL,
    supersedes  TEXT REFERENCES taste_signals(id)
  )`);
  sql.exec(`INSERT INTO taste_signals
      (id, space_id, project_id, owner_id, statement, dimensions, scope, status,
       confidence, created_by, approved_by, created_at, supersedes)
    SELECT id, space_id, project_id, owner_id, statement, dimensions, scope, status,
       confidence, created_by, approved_by, created_at, supersedes
    FROM taste_signals_old`);
  sql.exec(`DROP TABLE taste_signals_old`);
  sql.exec(`CREATE INDEX IF NOT EXISTS idx_taste_signals_project ON taste_signals(project_id)`);
}

export function migrate(sql: SqlStorage): void {
  // Required columns are fail-closed. Serving requests against a partially
  // migrated schema produces harder-to-diagnose data failures than a visible
  // boot error, while duplicate-column errors remain safely idempotent.
  addColumn(sql, "taste_signals", "supersedes", "TEXT");
  addColumn(sql, "taste_signals", "project_id", "TEXT");
  addColumn(sql, "accesses", "why", "TEXT");
  addColumn(sql, "accesses", "applied_signal_ids", "TEXT NOT NULL DEFAULT '[]'");
  addColumn(sql, "annotations", "dimensions", "TEXT");
  addColumn(sql, "tasks", "project_id", "TEXT");
  addColumn(sql, "artifacts", "region_id", "TEXT");

  // Supermemory is gone. Removing the table from schema.sql does nothing to a
  // Durable Object that already exists — schema.sql is all CREATE TABLE IF NOT
  // EXISTS — so a deployed space would keep the table and every queued row
  // forever. Drop it explicitly.
  sql.exec(`DROP TABLE IF EXISTS memory_outbox`);

  // SQLite cannot ALTER a CHECK constraint, so widening created_by to accept
  // 'agent' means rebuilding the table. Guarded by a probe insert: on an
  // already-widened DO this is a no-op and costs one rolled-back statement.
  widenTasteSignalCreatedBy(sql);

  // These indexes live here, not in schema.sql: they cover a column added above,
  // and schema.sql runs before this on every boot. IF NOT EXISTS keeps them
  // idempotent for DOs first created after project_id was in the CREATE TABLE.
  sql.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS idx_taste_signals_project ON taste_signals(project_id)`);

  // Before projects existed, project-scoped signals had no durable project to
  // identify. Keep their evidence and history, but make them personal rather
  // than pretending they belong to an unknown project. This is intentionally
  // limited to rows without a resolved project id so it cannot undo new data.
  sql.exec(
    `UPDATE taste_signals SET scope = 'personal', project_id = NULL
     WHERE scope = 'project' AND project_id IS NULL`,
  );

  // items_fts is derived state. A full DROP + reindex is a maintenance task, not
  // a per-boot one — SpaceDO runs rebuildFts() once per FTS_REBUILD_VERSION,
  // alongside the graph backfill. insertItem/updateItem/deleteItem keep the
  // index correct on every write in between.

  // Metering reconstruction is non-critical maintenance. It may fail without
  // making the canonical product schema unsafe to serve.
  try {
    backfillUsage(sql);
  } catch (e) {
    console.error("migrate: backfillUsage failed", e);
  }

  // Before artifacts.region_id existed, placement lived only as a meta tag
  // burned into a version's content_html (worker/mcp.ts's placementMarker) —
  // and nothing stopped a later record_artifact call from writing a
  // *different* region on a revision, so the same artifact could read as
  // belonging to more than one folder. Backfill from each artifact's FIRST
  // version (its true original placement, not whatever a later revision
  // claimed) so existing artifacts get the same one-folder guarantee.
  try {
    backfillArtifactRegions(sql);
  } catch (e) {
    console.error("migrate: backfillArtifactRegions failed", e);
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

const REGION_MARKER_RE = /<meta\s+name=["']gotothearchive-region["']\s+content=["']([^"']+)["']\s*\/?>/i;

/** One-time, idempotent: fills artifacts.region_id from each artifact's first version's placement marker. */
function backfillArtifactRegions(sql: SqlStorage): void {
  const rows = sql
    .exec<{ id: string; content_html: string }>(
      `SELECT a.id AS id, v.content_html AS content_html
       FROM artifacts a
       JOIN artifact_versions v ON v.artifact_id = a.id AND v.version_no = 1
       WHERE a.region_id IS NULL`,
    )
    .toArray();
  for (const row of rows) {
    const regionId = row.content_html.match(REGION_MARKER_RE)?.[1];
    if (regionId) sql.exec(`UPDATE artifacts SET region_id = ? WHERE id = ?`, regionId, row.id);
  }
}
