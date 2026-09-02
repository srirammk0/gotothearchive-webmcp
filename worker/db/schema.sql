-- FROZEN BUILD CONTRACT — GoToTheArchive
-- Durable Object SQLite schema. Applied once at DO init.
-- Mirrors shared/contract.ts exactly. The central integration track evolves both
-- together when a product decision changes.

CREATE TABLE IF NOT EXISTS spaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('personal','guest')),
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS regions (
  id          TEXT PRIMARY KEY,
  space_id    TEXT NOT NULL REFERENCES spaces(id),
  parent_id   TEXT REFERENCES regions(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (space_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_regions_space ON regions(space_id);

-- Cross-cutting working groupings. Projects never imply access by themselves;
-- their explicit members are intersected with the task grant and human access.
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  space_id    TEXT NOT NULL REFERENCES spaces(id),
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_space ON projects(space_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

CREATE TABLE IF NOT EXISTS items (
  id              TEXT PRIMARY KEY,
  space_id        TEXT NOT NULL REFERENCES spaces(id),
  region_id       TEXT NOT NULL REFERENCES regions(id),
  owner_id        TEXT NOT NULL,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  source_url      TEXT,
  content_ref     TEXT,
  semantic_text   TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}',
  authority_class TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_region ON items(region_id);
CREATE INDEX IF NOT EXISTS idx_items_space ON items(space_id);

-- A project member is exactly one explicit region or one explicit item. A
-- region member covers items stored in that region and its nested descendants;
-- graph relationships never create project membership.
CREATE TABLE IF NOT EXISTS project_members (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  region_id  TEXT REFERENCES regions(id),
  item_id    TEXT REFERENCES items(id),
  created_at INTEGER NOT NULL,
  CHECK ((region_id IS NOT NULL AND item_id IS NULL)
      OR (region_id IS NULL AND item_id IS NOT NULL)),
  UNIQUE (project_id, region_id),
  UNIQUE (project_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_region ON project_members(region_id);
CREATE INDEX IF NOT EXISTS idx_project_members_item ON project_members(item_id);

-- Full-text search over title + derived text. Contentless (content=''); rowid is
-- rowidFor(item.id) (a fold of the TEXT id), set explicitly on every write. That
-- fold never equals items' hidden sequential rowid, so searchItems() resolves
-- FTS hits back to items in JS rather than via a SQL join.
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  title, semantic_text, content=''
);

CREATE TABLE IF NOT EXISTS edges (
  id             TEXT PRIMARY KEY,
  from_id        TEXT NOT NULL,
  to_id          TEXT NOT NULL,
  relationship   TEXT NOT NULL,
  weight         REAL NOT NULL DEFAULT 1.0,
  created_by     TEXT NOT NULL,
  approval_state TEXT NOT NULL DEFAULT 'approved'
                 CHECK (approval_state IN ('approved','proposed','rejected')),
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);

-- Free-text notes a human attaches to a single archived item ("block").
CREATE TABLE IF NOT EXISTS item_notes (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id),
  space_id   TEXT NOT NULL REFERENCES spaces(id),
  author_id  TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_item_notes_item ON item_notes(item_id);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  space_id     TEXT NOT NULL REFERENCES spaces(id),
  project_id   TEXT REFERENCES projects(id),
  human_id     TEXT NOT NULL,
  title        TEXT NOT NULL,
  instruction  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','complete','cancelled')),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER
);
-- idx_tasks_project is created in migrate() — tasks predates project_id on
-- existing DOs, so the index can't live here (CREATE TABLE IF NOT EXISTS skips
-- the column, and this would run before migrate() adds it).

CREATE TABLE IF NOT EXISTS grants (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  space_id    TEXT NOT NULL REFERENCES spaces(id),
  region_id   TEXT NOT NULL REFERENCES regions(id),
  level       TEXT NOT NULL CHECK (level IN ('none','read','propose','write')),
  grantor_id  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER,
  revoked_at  INTEGER,
  revoked_by  TEXT,
  reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_grants_task ON grants(task_id);
CREATE INDEX IF NOT EXISTS idx_grants_region ON grants(region_id);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id          TEXT PRIMARY KEY,
  human_id    TEXT NOT NULL,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  declared    TEXT,
  created_at  INTEGER NOT NULL
);

-- region_id is set once at creation and never moved — an artifact belongs to
-- exactly one folder, ever. See record_artifact in worker/mcp.ts.
CREATE TABLE IF NOT EXISTS artifacts (
  id          TEXT PRIMARY KEY,
  space_id    TEXT NOT NULL REFERENCES spaces(id),
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  region_id   TEXT REFERENCES regions(id),
  created_at  INTEGER NOT NULL
);

-- Immutable. Never UPDATE a row here except the state column via a decision.
CREATE TABLE IF NOT EXISTS artifact_versions (
  id                TEXT PRIMARY KEY,
  artifact_id       TEXT NOT NULL REFERENCES artifacts(id),
  version_no        INTEGER NOT NULL,
  parent_version_id TEXT REFERENCES artifact_versions(id),
  content_html      TEXT NOT NULL,
  agent_session_id  TEXT REFERENCES agent_sessions(id),
  state             TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  UNIQUE (artifact_id, version_no)
);

-- Three DISTINCT provenance types. Never collapse these into one table.
CREATE TABLE IF NOT EXISTS influences (
  id         TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES artifact_versions(id),
  item_id    TEXT NOT NULL REFERENCES items(id),
  role       TEXT NOT NULL,
  strength   REAL NOT NULL DEFAULT 1.0,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_influences_version ON influences(version_id);

CREATE TABLE IF NOT EXISTS accesses (
  id                 TEXT PRIMARY KEY,
  task_id            TEXT NOT NULL REFERENCES tasks(id),
  item_id            TEXT NOT NULL REFERENCES items(id),
  tool_name          TEXT NOT NULL,
  at                 INTEGER NOT NULL,
  -- retrieve() fills these; other tool calls leave them null / '[]'.
  why                TEXT,
  applied_signal_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_accesses_task ON accesses(task_id);

CREATE TABLE IF NOT EXISTS denials (
  id               TEXT PRIMARY KEY,
  task_id          TEXT,
  agent_session_id TEXT,
  tool_name        TEXT NOT NULL,
  requested        TEXT NOT NULL DEFAULT '{}',
  reason           TEXT NOT NULL,
  at               INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_denials_task ON denials(task_id);

CREATE TABLE IF NOT EXISTS annotations (
  id         TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES artifact_versions(id),
  author_id  TEXT NOT NULL,
  target     TEXT,
  sentiment  TEXT NOT NULL CHECK (sentiment IN ('positive','negative','neutral')),
  dimension  TEXT,             -- legacy scalar; mirrors dimensions[0]
  dimensions TEXT,             -- JSON array of taste dimensions
  comment    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open'
             CHECK (status IN ('open','resolved','superseded')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_version ON annotations(version_id);

CREATE TABLE IF NOT EXISTS decisions (
  id         TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES artifact_versions(id),
  actor_id   TEXT NOT NULL,
  decision   TEXT NOT NULL,
  note       TEXT,
  prev_state TEXT NOT NULL,
  at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS taste_signals (
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
  created_by  TEXT NOT NULL CHECK (created_by IN ('system','human')),
  approved_by TEXT,
  created_at  INTEGER NOT NULL,
  -- Bitemporal correction: a materially changed or replaced signal is not
  -- overwritten. The old row goes status='superseded' and the new row points
  -- back at it here. Retrieval reads only status='confirmed'; the Taste UI
  -- walks this chain for the "how the judgement changed" timeline.
  supersedes  TEXT REFERENCES taste_signals(id)
);
-- idx_taste_signals_project is created in migrate() (see idx_tasks_project note).

CREATE TABLE IF NOT EXISTS taste_evidence (
  id            TEXT PRIMARY KEY,
  signal_id     TEXT NOT NULL REFERENCES taste_signals(id),
  kind          TEXT NOT NULL CHECK (kind IN ('supports','contradicts')),
  annotation_id TEXT,
  version_id    TEXT,
  item_id       TEXT
);
CREATE INDEX IF NOT EXISTS idx_evidence_signal ON taste_evidence(signal_id);

-- The lifecycle and usage history of a taste signal: proposed / edited /
-- accepted / rescoped / rejected / superseded, plus 'applied' rows recorded
-- every time an agent draws on the signal while producing work.
CREATE TABLE IF NOT EXISTS taste_events (
  id               TEXT PRIMARY KEY,
  signal_id        TEXT NOT NULL REFERENCES taste_signals(id),
  kind             TEXT NOT NULL CHECK (kind IN
                     ('proposed','edited','accepted','rescoped','rejected','superseded','applied')),
  actor_type       TEXT NOT NULL CHECK (actor_type IN ('agent','human','system')),
  actor_label      TEXT NOT NULL DEFAULT '',
  agent_session_id TEXT,
  detail           TEXT NOT NULL DEFAULT '',
  version_id       TEXT,
  at               INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_taste_events_signal ON taste_events(signal_id);
CREATE INDEX IF NOT EXISTS idx_taste_events_at ON taste_events(at);

CREATE TABLE IF NOT EXISTS audit_events (
  id               TEXT PRIMARY KEY,
  actor_type       TEXT NOT NULL CHECK (actor_type IN ('human','agent','system')),
  actor_label      TEXT NOT NULL,
  agent_session_id TEXT,
  human_id         TEXT,
  task_id          TEXT,
  tool_name        TEXT,
  operation        TEXT NOT NULL,
  payload          TEXT NOT NULL DEFAULT '{}',
  at               INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events(at);

-- Closed beta: a hard 25-member cap plus a per-member monthly usage counter.
-- Both live in the single DO alongside every space, so the cap is global.
CREATE TABLE IF NOT EXISTS beta_members (
  human_id  TEXT PRIMARY KEY,
  slot_no   INTEGER NOT NULL,
  joined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_counters (
  human_id TEXT NOT NULL,
  period   TEXT NOT NULL,
  metric   TEXT NOT NULL,
  used     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (human_id, period, metric)
);

-- Deferred mirror of item writes to the external memory index (Supermemory).
-- Enqueued in the same request as the item mutation (a plain local insert, so
-- capture latency is unchanged); drained by SpaceDO.alarm(). Supermemory is a
-- retrieval *augmentation* only — the row here never gates access and a stuck
-- job only means that item stays FTS-only until the next drain.
CREATE TABLE IF NOT EXISTS memory_outbox (
  id            TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL,
  op            TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  item_id       TEXT NOT NULL,
  custom_id     TEXT NOT NULL,              -- Supermemory customId; stable == item_id
  container_tag TEXT NOT NULL,              -- == space_id; tenant isolation in Supermemory
  payload       TEXT NOT NULL DEFAULT '{}', -- {title, semantic_text, region_id, authority_class}
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','done','failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  doc_id        TEXT,                       -- Supermemory document id, once known
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_outbox_pending ON memory_outbox(status, updated_at);
