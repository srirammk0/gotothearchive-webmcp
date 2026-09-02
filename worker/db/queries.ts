/**
 * Typed data access over a SpaceDO's this.ctx.storage.sql.
 * One SqlStorage per Space (per DO instance) — space_id columns still stored
 * for shape-fidelity with the shared contract, but every query here is scoped
 * to the single space living in this DO.
 */
import type {
  Space,
  Region,
  Project,
  ProjectMember,
  ContextItem,
  ContextEdge,
  Task,
  Grant,
  AgentSession,
  Artifact,
  ArtifactVersion,
  InfluenceRecord,
  AccessRecord,
  DenialRecord,
  Annotation,
  DecisionRecord,
  TasteSignal,
  TasteEvidence,
  TasteEvent,
  ItemNote,
  AuditEvent,
  GrantLevel,
  AuthorityClass,
  Relationship,
  ItemType,
  ArtifactState,
  ReviewDecision,
} from "@shared/contract";

/* Row shapes as stored in sqlite (json columns are TEXT). */
interface SpaceRow {
  [key: string]: SqlStorageValue;
  id: string;
  name: string;
  owner_id: string;
  kind: string;
  created_at: number;
}
interface RegionRow {
  [key: string]: SqlStorageValue;
  id: string;
  space_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  created_at: number;
}
interface ProjectRow {
  [key: string]: SqlStorageValue;
  id: string;
  space_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}
interface ProjectMemberRow {
  [key: string]: SqlStorageValue;
  id: string;
  project_id: string;
  region_id: string | null;
  item_id: string | null;
  created_at: number;
}
interface ItemRow {
  [key: string]: SqlStorageValue;
  id: string;
  space_id: string;
  region_id: string;
  owner_id: string;
  type: string;
  title: string;
  source_url: string | null;
  content_ref: string | null;
  semantic_text: string | null;
  metadata: string;
  authority_class: string;
  created_by: string;
  created_at: number;
  updated_at: number;
}
interface EdgeRow {
  [key: string]: SqlStorageValue;
  id: string;
  from_id: string;
  to_id: string;
  relationship: string;
  weight: number;
  created_by: string;
  approval_state: string;
  created_at: number;
}
interface TaskRow {
  [key: string]: SqlStorageValue;
  id: string;
  space_id: string;
  project_id: string | null;
  human_id: string;
  title: string;
  instruction: string;
  status: string;
  created_at: number;
  expires_at: number | null;
}
interface GrantRow {
  [key: string]: SqlStorageValue;
  id: string;
  task_id: string;
  space_id: string;
  region_id: string;
  level: string;
  grantor_id: string;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  revoked_by: string | null;
  reason: string | null;
}
interface AgentSessionRow {
  [key: string]: SqlStorageValue;
  id: string;
  human_id: string;
  task_id: string;
  declared: string | null;
  created_at: number;
}
interface ArtifactRow {
  [key: string]: SqlStorageValue;
  id: string;
  space_id: string;
  task_id: string;
  kind: string;
  title: string;
  created_at: number;
}
interface ArtifactVersionRow {
  [key: string]: SqlStorageValue;
  id: string;
  artifact_id: string;
  version_no: number;
  parent_version_id: string | null;
  content_html: string;
  agent_session_id: string | null;
  state: string;
  created_at: number;
}
interface InfluenceRow {
  [key: string]: SqlStorageValue;
  id: string;
  version_id: string;
  item_id: string;
  role: string;
  strength: number;
  note: string | null;
}
interface AccessRow {
  [key: string]: SqlStorageValue;
  id: string;
  task_id: string;
  item_id: string;
  tool_name: string;
  at: number;
  why: string | null;
  applied_signal_ids: string;
}
interface DenialRow {
  [key: string]: SqlStorageValue;
  id: string;
  task_id: string | null;
  agent_session_id: string | null;
  tool_name: string;
  requested: string;
  reason: string;
  at: number;
}
interface AnnotationRow {
  [key: string]: SqlStorageValue;
  id: string;
  version_id: string;
  author_id: string;
  target: string | null;
  sentiment: string;
  /** JSON array of taste dimensions. Legacy rows may have only the scalar `dimension`. */
  dimensions: string | null;
  dimension: string | null;
  comment: string;
  status: string;
  created_at: number;
}
interface DecisionRow {
  [key: string]: SqlStorageValue;
  id: string;
  version_id: string;
  actor_id: string;
  decision: string;
  note: string | null;
  prev_state: string;
  at: number;
}
interface TasteSignalRow {
  [key: string]: SqlStorageValue;
  id: string;
  space_id: string;
  project_id: string | null;
  owner_id: string;
  statement: string;
  dimensions: string;
  scope: string;
  status: string;
  confidence: number;
  created_by: string;
  approved_by: string | null;
  created_at: number;
  supersedes: string | null;
}
interface TasteEvidenceRow {
  [key: string]: SqlStorageValue;
  id: string;
  signal_id: string;
  kind: string;
  annotation_id: string | null;
  version_id: string | null;
  item_id: string | null;
}
interface TasteEventRow {
  [key: string]: SqlStorageValue;
  id: string;
  signal_id: string;
  kind: string;
  actor_type: string;
  actor_label: string;
  agent_session_id: string | null;
  detail: string;
  version_id: string | null;
  at: number;
}
interface ItemNoteRow {
  [key: string]: SqlStorageValue;
  id: string;
  item_id: string;
  space_id: string;
  author_id: string;
  body: string;
  created_at: number;
}
interface AuditEventRow {
  [key: string]: SqlStorageValue;
  id: string;
  actor_type: string;
  actor_label: string;
  agent_session_id: string | null;
  human_id: string | null;
  task_id: string | null;
  tool_name: string | null;
  operation: string;
  payload: string;
  at: number;
}

function toSpace(r: SpaceRow): Space {
  return { ...r, kind: r.kind as Space["kind"] };
}
function toRegion(r: RegionRow): Region {
  return { ...r };
}
function toProject(r: ProjectRow): Project {
  return { ...r };
}
function toProjectMember(r: ProjectMemberRow): ProjectMember {
  return { ...r };
}
function toItem(r: ItemRow): ContextItem {
  return {
    ...r,
    type: r.type as ItemType,
    metadata: JSON.parse(r.metadata) as Record<string, unknown>,
    authority_class: r.authority_class as AuthorityClass,
  };
}
function toEdge(r: EdgeRow): ContextEdge {
  return {
    ...r,
    relationship: r.relationship as Relationship,
    approval_state: r.approval_state as ContextEdge["approval_state"],
  };
}
function toTask(r: TaskRow): Task {
  return { ...r, status: r.status as Task["status"], project_id: r.project_id ?? null };
}
function toGrant(r: GrantRow): Grant {
  return { ...r, level: r.level as GrantLevel };
}
function toAgentSession(r: AgentSessionRow): AgentSession {
  return {
    ...r,
    declared: r.declared
      ? (JSON.parse(r.declared) as AgentSession["declared"])
      : null,
  };
}
function toArtifact(r: ArtifactRow): Artifact {
  return { ...r, kind: r.kind as Artifact["kind"] };
}
function toArtifactVersion(r: ArtifactVersionRow): ArtifactVersion {
  return { ...r, state: r.state as ArtifactState };
}
function toInfluence(r: InfluenceRow): InfluenceRecord {
  return { ...r };
}
function toAccess(r: AccessRow): AccessRecord {
  const { applied_signal_ids, ...rest } = r;
  return { ...rest, applied_signal_ids: JSON.parse(applied_signal_ids || "[]") as string[] };
}
function toDenial(r: DenialRow): DenialRecord {
  return {
    ...r,
    requested: JSON.parse(r.requested) as Record<string, unknown>,
  };
}
function toAnnotation(r: AnnotationRow): Annotation {
  const dimensions = r.dimensions
    ? (JSON.parse(r.dimensions) as Annotation["dimensions"])
    : r.dimension
      ? ([r.dimension] as Annotation["dimensions"])
      : [];
  return {
    id: r.id,
    version_id: r.version_id,
    author_id: r.author_id,
    target: r.target ? (JSON.parse(r.target) as Annotation["target"]) : null,
    sentiment: r.sentiment as Annotation["sentiment"],
    dimensions,
    comment: r.comment,
    status: r.status as Annotation["status"],
    created_at: r.created_at,
  };
}
function toDecision(r: DecisionRow): DecisionRecord {
  return {
    ...r,
    decision: r.decision as ReviewDecision,
    prev_state: r.prev_state as ArtifactState,
  };
}
function toTasteSignal(r: TasteSignalRow): TasteSignal {
  return {
    ...r,
    dimensions: JSON.parse(r.dimensions) as TasteSignal["dimensions"],
    scope: r.scope as TasteSignal["scope"],
    status: r.status as TasteSignal["status"],
    created_by: r.created_by as TasteSignal["created_by"],
    project_id: r.project_id ?? null,
  };
}
function toTasteEvidence(r: TasteEvidenceRow): TasteEvidence {
  return { ...r, kind: r.kind as TasteEvidence["kind"] };
}
function toTasteEvent(r: TasteEventRow): TasteEvent {
  return {
    ...r,
    kind: r.kind as TasteEvent["kind"],
    actor_type: r.actor_type as TasteEvent["actor_type"],
  };
}
function toAuditEvent(r: AuditEventRow): AuditEvent {
  return {
    ...r,
    actor_type: r.actor_type as AuditEvent["actor_type"],
    payload: JSON.parse(r.payload) as Record<string, unknown>,
  };
}

export interface MemoryOutboxPayload {
  title: string;
  semantic_text: string | null;
  region_id: string;
  authority_class: string;
  /** R2 key of the item's canonical file, when it has one — the drain sends the
   * bytes to the memory index so image / PDF content becomes searchable. */
  content_ref: string | null;
  /** Coarse file class for the index: "image" | "pdf" | "document" | null. */
  file_type: string | null;
}
interface MemoryOutboxRow {
  [key: string]: SqlStorageValue;
  id: string;
  space_id: string;
  op: string;
  item_id: string;
  custom_id: string;
  container_tag: string;
  payload: string;
  status: string;
  attempts: number;
  last_error: string | null;
  doc_id: string | null;
  created_at: number;
  updated_at: number;
}
export interface MemoryOutboxJob {
  id: string;
  space_id: string;
  op: "upsert" | "delete";
  item_id: string;
  custom_id: string;
  container_tag: string;
  payload: MemoryOutboxPayload;
  attempts: number;
  doc_id: string | null;
}
function toMemoryOutboxJob(r: MemoryOutboxRow): MemoryOutboxJob {
  const raw = JSON.parse(r.payload) as Partial<MemoryOutboxPayload>;
  return {
    id: r.id,
    space_id: r.space_id,
    op: r.op === "delete" ? "delete" : "upsert",
    item_id: r.item_id,
    custom_id: r.custom_id,
    container_tag: r.container_tag,
    payload: {
      title: raw.title ?? "",
      semantic_text: raw.semantic_text ?? null,
      region_id: raw.region_id ?? "",
      authority_class: raw.authority_class ?? "",
      content_ref: raw.content_ref ?? null,
      file_type: raw.file_type ?? null,
    },
    attempts: r.attempts,
    doc_id: r.doc_id ?? null,
  };
}

export class Queries {
  /** Project scope selected by openAnnotationsForSpace for the current derive run. */
  private tasteDerivationProjectId: string | null | undefined;

  /**
   * `mirrorMemory` makes insert/update/deleteItem also queue a memory_outbox
   * row — the same transparent-derived-state pattern items_fts already uses,
   * but for the external index. Off by default so tests and any Supermemory-less
   * deployment write nothing extra.
   */
  constructor(
    private sql: SqlStorage,
    private opts: { mirrorMemory?: boolean } = {},
  ) {}

  private mirrorItem(op: "upsert" | "delete", item: ContextItem, now: number): void {
    if (!this.opts.mirrorMemory) return;
    this.enqueueMemoryOp({
      space_id: item.space_id,
      op,
      item_id: item.id,
      payload: {
        title: item.title,
        semantic_text: item.semantic_text,
        region_id: item.region_id,
        authority_class: item.authority_class,
        content_ref: item.content_ref,
        file_type:
          item.type === "image" || item.type === "screenshot"
            ? "image"
            : item.type === "pdf"
              ? "pdf"
              : item.content_ref
                ? "document"
                : null,
      },
      now,
    });
  }

  /**
   * Catch the external index up: queue an upsert for every item that has never
   * successfully synced (no 'done' row) and isn't already pending. Covers items
   * captured before the mirror existed or before the API key was set. Cheap and
   * idempotent — safe to run on every boot; the alarm drains the backlog.
   */
  backfillMemoryOutbox(spaceId: string): number {
    if (!this.opts.mirrorMemory) return 0;
    const now = Date.now();
    let queued = 0;
    for (const item of this.listItemsBySpace(spaceId)) {
      const seen = this.sql
        .exec<{ n: number }>(
          `SELECT COUNT(*) AS n FROM memory_outbox WHERE item_id = ? AND status IN ('done', 'pending')`,
          item.id,
        )
        .toArray()[0]?.n ?? 0;
      if (seen > 0) continue;
      this.mirrorItem("upsert", item, now);
      queued++;
    }
    return queued;
  }

  /* ---------------- spaces ---------------- */

  insertSpace(s: Space): void {
    this.sql.exec(
      `INSERT INTO spaces (id, name, owner_id, kind, created_at) VALUES (?, ?, ?, ?, ?)`,
      s.id,
      s.name,
      s.owner_id,
      s.kind,
      s.created_at,
    );
  }

  getSpace(id: string): Space | null {
    const row = this.sql
      .exec<SpaceRow>(`SELECT * FROM spaces WHERE id = ?`, id)
      .toArray()[0];
    return row ? toSpace(row) : null;
  }

  listSpaces(): Space[] {
    return this.sql
      .exec<SpaceRow>(`SELECT * FROM spaces`)
      .toArray()
      .map(toSpace);
  }

  /* ---------------- projects ---------------- */

  insertProject(p: Project): void {
    this.sql.exec(
      `INSERT INTO projects (id, space_id, owner_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      p.id,
      p.space_id,
      p.owner_id,
      p.name,
      p.description,
      p.created_at,
      p.updated_at,
    );
  }

  getProject(id: string): Project | null {
    const row = this.sql.exec<ProjectRow>(`SELECT * FROM projects WHERE id = ?`, id).toArray()[0];
    return row ? toProject(row) : null;
  }

  listProjects(spaceId: string): Project[] {
    return this.sql
      .exec<ProjectRow>(`SELECT * FROM projects WHERE space_id = ? ORDER BY updated_at DESC`, spaceId)
      .toArray()
      .map(toProject);
  }

  updateProject(id: string, name: string, description: string | null, updatedAt: number): void {
    this.sql.exec(
      `UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
      name,
      description,
      updatedAt,
      id,
    );
  }

  /** Version marker for derived graph rules, kept in the append-only audit ledger. */
  graphBackfillVersion(spaceId: string): number | null {
    const space = this.getSpace(spaceId);
    if (!space) return null;
    const rows = this.sql
      .exec<{ payload: string }>(
        `SELECT payload FROM audit_events
         WHERE actor_type = 'system' AND operation = 'graph_backfill' AND human_id = ?
         ORDER BY at DESC LIMIT 20`,
        space.owner_id,
      )
      .toArray();
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload) as { space_id?: unknown; version?: unknown };
        if (payload.space_id === spaceId && typeof payload.version === "number") return payload.version;
      } catch {
        // Ignore malformed historical marker rows and continue looking for a valid one.
      }
    }
    return null;
  }

  recordGraphBackfill(spaceId: string, version: number, at: number): void {
    const space = this.getSpace(spaceId);
    if (!space) return;
    this.insertAuditEvent({
      id: crypto.randomUUID(),
      actor_type: "system",
      actor_label: "Graph maintenance",
      agent_session_id: null,
      human_id: space.owner_id,
      task_id: null,
      tool_name: null,
      operation: "graph_backfill",
      payload: { space_id: spaceId, version },
      at,
    });
  }

  /**
   * DO-wide marker for the last items_fts rebuild. Unlike graph backfill this is
   * not per-space (the FTS index spans every space in the DO), so the newest
   * 'fts_rebuild' audit row wins. Keeps `rebuildFts` — a full DROP + reindex —
   * from running on every single boot.
   */
  ftsRebuildVersion(): number | null {
    const rows = this.sql
      .exec<{ payload: string }>(
        `SELECT payload FROM audit_events
         WHERE actor_type = 'system' AND operation = 'fts_rebuild'
         ORDER BY at DESC LIMIT 5`,
      )
      .toArray();
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload) as { version?: unknown };
        if (typeof payload.version === "number") return payload.version;
      } catch {
        // Skip a malformed historical marker and keep looking.
      }
    }
    return null;
  }

  recordFtsRebuild(version: number, at: number): void {
    this.insertAuditEvent({
      id: crypto.randomUUID(),
      actor_type: "system",
      actor_label: "Search maintenance",
      agent_session_id: null,
      human_id: null,
      task_id: null,
      tool_name: null,
      operation: "fts_rebuild",
      payload: { version },
      at,
    });
  }

  /* ---------------- regions ---------------- */

  insertRegion(r: Region): void {
    this.sql.exec(
      `INSERT INTO regions (id, space_id, parent_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      r.id,
      r.space_id,
      r.parent_id,
      r.name,
      r.slug,
      r.created_at,
    );
  }

  listRegions(spaceId: string): Region[] {
    return this.sql
      .exec<RegionRow>(`SELECT * FROM regions WHERE space_id = ?`, spaceId)
      .toArray()
      .map(toRegion);
  }

  getRegion(id: string): Region | null {
    const row = this.sql
      .exec<RegionRow>(`SELECT * FROM regions WHERE id = ?`, id)
      .toArray()[0];
    return row ? toRegion(row) : null;
  }

  getRegionBySlug(spaceId: string, slug: string): Region | null {
    const row = this.sql
      .exec<RegionRow>(
        `SELECT * FROM regions WHERE space_id = ? AND slug = ?`,
        spaceId,
        slug,
      )
      .toArray()[0];
    return row ? toRegion(row) : null;
  }

  updateRegion(id: string, name: string, slug: string): void {
    this.sql.exec(`UPDATE regions SET name = ?, slug = ? WHERE id = ?`, name, slug, id);
  }

  deleteRegion(id: string): void {
    // grants.region_id has a FK to regions; clear them before the row goes.
    this.sql.exec(`DELETE FROM grants WHERE region_id = ?`, id);
    this.sql.exec(`DELETE FROM project_members WHERE region_id = ?`, id);
    this.sql.exec(`DELETE FROM regions WHERE id = ?`, id);
  }

  countItemsByRegion(regionId: string): number {
    return (
      this.sql
        .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM items WHERE region_id = ?`, regionId)
        .toArray()[0]?.n ?? 0
    );
  }

  /* ---------------- items (+ FTS sync) ---------------- */

  insertItem(item: ContextItem): void {
    this.sql.exec(
      `INSERT INTO items (id, space_id, region_id, owner_id, type, title, source_url, content_ref, semantic_text, metadata, authority_class, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      item.space_id,
      item.region_id,
      item.owner_id,
      item.type,
      item.title,
      item.source_url,
      item.content_ref,
      item.semantic_text,
      JSON.stringify(item.metadata),
      item.authority_class,
      item.created_by,
      item.created_at,
      item.updated_at,
    );
    this.sql.exec(
      `INSERT INTO items_fts (rowid, title, semantic_text) VALUES (?, ?, ?)`,
      rowidFor(item.id),
      item.title,
      item.semantic_text ?? "",
    );
    this.mirrorItem("upsert", item, item.updated_at);
  }

  /**
   * items_fts is contentless (content=''), so individual rows can't be UPDATEd
   * or plain-DELETEd — the only removal is the special 'delete' command, which
   * needs the row's *previous* column values. So: capture the old text, mutate
   * items, then delete-then-reinsert the FTS row.
   */
  private ftsPrev(id: string): { title: string; semantic_text: string | null } | undefined {
    return this.sql
      .exec<{ title: string; semantic_text: string | null }>(
        `SELECT title, semantic_text FROM items WHERE id = ?`,
        id,
      )
      .toArray()[0];
  }

  private ftsDelete(id: string, prev: { title: string; semantic_text: string | null }): void {
    this.sql.exec(
      `INSERT INTO items_fts (items_fts, rowid, title, semantic_text) VALUES ('delete', ?, ?, ?)`,
      rowidFor(id),
      prev.title,
      prev.semantic_text ?? "",
    );
  }

  updateItem(item: ContextItem): void {
    const prev = this.ftsPrev(item.id);
    this.sql.exec(
      `UPDATE items SET region_id = ?, title = ?, source_url = ?, content_ref = ?, semantic_text = ?, metadata = ?, authority_class = ?, updated_at = ?
       WHERE id = ?`,
      item.region_id,
      item.title,
      item.source_url,
      item.content_ref,
      item.semantic_text,
      JSON.stringify(item.metadata),
      item.authority_class,
      item.updated_at,
      item.id,
    );
    if (prev) this.ftsDelete(item.id, prev);
    this.sql.exec(
      `INSERT INTO items_fts (rowid, title, semantic_text) VALUES (?, ?, ?)`,
      rowidFor(item.id),
      item.title,
      item.semantic_text ?? "",
    );
    this.mirrorItem("upsert", item, item.updated_at);
  }

  deleteItem(id: string): void {
    const prev = this.ftsPrev(id);
    const doomed = this.opts.mirrorMemory ? this.getItem(id) : null;
    // influences.item_id and accesses.item_id have FKs to items; edges and
    // taste_evidence reference items by id without one. Clear all of them.
    this.sql.exec(`DELETE FROM influences WHERE item_id = ?`, id);
    this.sql.exec(`DELETE FROM accesses WHERE item_id = ?`, id);
    this.sql.exec(`DELETE FROM edges WHERE from_id = ? OR to_id = ?`, id, id);
    this.sql.exec(`DELETE FROM item_notes WHERE item_id = ?`, id);
    this.sql.exec(`DELETE FROM project_members WHERE item_id = ?`, id);
    this.sql.exec(`UPDATE taste_evidence SET item_id = NULL WHERE item_id = ?`, id);
    this.sql.exec(`DELETE FROM items WHERE id = ?`, id);
    if (prev) this.ftsDelete(id, prev);
    if (doomed) this.mirrorItem("delete", doomed, Date.now());
  }

  /**
   * One-time cleanup: remove items that older captures spun off from an
   * extracted link (media / referenced URLs). Those are now folded into the
   * parent item's metadata. Fingerprint: the source-linked authority class plus
   * a `derived_from_item_id` in metadata — only the removed child() path ever
   * produced both. Full cascade per row; idempotent.
   */
  deleteExtractionChildren(spaceId: string): number {
    const rows = this.sql
      .exec<{ id: string }>(
        `SELECT id FROM items
         WHERE space_id = ? AND authority_class = 'imported_source_linked'
           AND metadata LIKE '%derived_from_item_id%'`,
        spaceId,
      )
      .toArray();
    for (const row of rows) this.deleteItem(row.id);
    return rows.length;
  }

  getItem(id: string): ContextItem | null {
    const row = this.sql
      .exec<ItemRow>(`SELECT * FROM items WHERE id = ?`, id)
      .toArray()[0];
    return row ? toItem(row) : null;
  }

  getItems(ids: string[]): ContextItem[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    return this.sql
      .exec<ItemRow>(`SELECT * FROM items WHERE id IN (${placeholders})`, ...ids)
      .toArray()
      .map(toItem);
  }

  listItemsByRegion(regionId: string): ContextItem[] {
    return this.sql
      .exec<ItemRow>(`SELECT * FROM items WHERE region_id = ?`, regionId)
      .toArray()
      .map(toItem);
  }

  listItemsByRegions(regionIds: string[]): ContextItem[] {
    if (regionIds.length === 0) return [];
    const placeholders = regionIds.map(() => "?").join(",");
    return this.sql
      .exec<ItemRow>(
        `SELECT * FROM items WHERE region_id IN (${placeholders})`,
        ...regionIds,
      )
      .toArray()
      .map(toItem);
  }

  listItemsBySpace(spaceId: string): ContextItem[] {
    return this.sql
      .exec<ItemRow>(`SELECT * FROM items WHERE space_id = ?`, spaceId)
      .toArray()
      .map(toItem);
  }

  /* ---------------- project membership ---------------- */

  insertProjectMember(m: ProjectMember): void {
    const project = this.getProject(m.project_id);
    const region = m.region_id ? this.getRegion(m.region_id) : null;
    const item = m.item_id ? this.getItem(m.item_id) : null;
    const targets = Number(m.region_id !== null) + Number(m.item_id !== null);
    if (
      !project ||
      targets !== 1 ||
      (m.region_id !== null && (!region || region.space_id !== project.space_id)) ||
      (m.item_id !== null && (!item || item.space_id !== project.space_id))
    ) {
      throw new Error("project membership target must belong to the project space");
    }
    this.sql.exec(
      `INSERT INTO project_members (id, project_id, region_id, item_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      m.id,
      m.project_id,
      m.region_id,
      m.item_id,
      m.created_at,
    );
  }

  getProjectMember(id: string): ProjectMember | null {
    const row = this.sql
      .exec<ProjectMemberRow>(`SELECT * FROM project_members WHERE id = ?`, id)
      .toArray()[0];
    return row ? toProjectMember(row) : null;
  }

  listProjectMembers(projectId: string): ProjectMember[] {
    return this.sql
      .exec<ProjectMemberRow>(
        `SELECT * FROM project_members WHERE project_id = ? ORDER BY created_at, id`,
        projectId,
      )
      .toArray()
      .map(toProjectMember);
  }

  projectMemberForTarget(projectId: string, regionId: string | null, itemId: string | null): ProjectMember | null {
    const row = this.sql
      .exec<ProjectMemberRow>(
        `SELECT * FROM project_members
         WHERE project_id = ? AND ((region_id = ? AND ? IS NOT NULL) OR (item_id = ? AND ? IS NOT NULL))`,
        projectId,
        regionId,
        regionId,
        itemId,
        itemId,
      )
      .toArray()[0];
    return row ? toProjectMember(row) : null;
  }

  deleteProjectMember(id: string): void {
    this.sql.exec(`DELETE FROM project_members WHERE id = ?`, id);
  }

  /** Direct project region members plus all nested regions below them. */
  projectRegionIds(projectId: string): string[] {
    const project = this.getProject(projectId);
    if (!project) return [];
    const regions = this.listRegions(project.space_id);
    const children = new Map<string, Region[]>();
    for (const region of regions) {
      const bucket = children.get(region.parent_id ?? "");
      if (bucket) bucket.push(region);
      else children.set(region.parent_id ?? "", [region]);
    }
    const roots = this.listProjectMembers(projectId)
      .map((member) => member.region_id)
      .filter((id): id is string => id !== null && regions.some((region) => region.id === id));
    const out = new Set<string>();
    const visit = (id: string): void => {
      if (out.has(id)) return;
      out.add(id);
      for (const child of children.get(id) ?? []) visit(child.id);
    };
    for (const root of roots) visit(root);
    return [...out];
  }

  /** The exact item scope of a project: direct item members or items in member regions. */
  projectItemIds(projectId: string): string[] {
    const project = this.getProject(projectId);
    if (!project) return [];
    const ids = new Set(this.listItemsByRegions(this.projectRegionIds(projectId)).map((item) => item.id));
    for (const member of this.listProjectMembers(projectId)) {
      if (member.item_id) {
        const item = this.getItem(member.item_id);
        if (item?.space_id === project.space_id) ids.add(item.id);
      }
    }
    return [...ids];
  }

  projectContainsItem(projectId: string, itemId: string): boolean {
    return new Set(this.projectItemIds(projectId)).has(itemId);
  }

  /**
   * FTS match, restricted in SQL to the caller's already-authorized item set.
   * `allowedItemIds` is used for project tasks; omitting it preserves the
   * ordinary region-scoped behavior. The explicit rowid predicate is important:
   * filtering global FTS hits after LIMIT can hide an authorized project item
   * behind unrelated rows.
   */
  searchItems(
    query: string,
    allowedRegionIds: string[],
    limit: number,
    allowedItemIds?: string[],
  ): ContextItem[] {
    if (allowedRegionIds.length === 0 || query.trim() === "") return [];
    const safeLimit = Number.isFinite(limit) ? Math.min(20, Math.max(1, Math.floor(limit))) : 10;
    const cap = Math.max(safeLimit * 8, 200);
    const regionSet = new Set(allowedRegionIds);
    const scopedItems = (allowedItemIds === undefined
      ? this.listItemsByRegions(allowedRegionIds)
      : this.getItems([...new Set(allowedItemIds)]).filter((item) => regionSet.has(item.region_id)))
      .filter((item) => regionSet.has(item.region_id));
    if (scopedItems.length === 0) return [];

    const byFold = new Map(scopedItems.map((item) => [rowidFor(item.id), item]));
    const rowids = [...byFold.keys()];
    // Keep the binding count below SQLite's common variable limit while still
    // applying the project/item scope before FTS ranking and LIMIT.
    const chunkSize = 400;
    const run = (match: string): ContextItem[] => {
      const found: ContextItem[] = [];
      const seen = new Set<number>();
      for (let start = 0; start < rowids.length && found.length < safeLimit; start += chunkSize) {
        const chunk = rowids.slice(start, start + chunkSize);
        const ph = chunk.map(() => "?").join(",");
        const matched = this.sql
          .exec<{ rowid: number }>(
            `SELECT rowid FROM items_fts
             WHERE items_fts MATCH ? AND rowid IN (${ph})
             ORDER BY rank LIMIT ?`,
            match,
            ...chunk,
            cap,
          )
          .toArray();
        for (const row of matched) {
          if (seen.has(row.rowid)) continue;
          const item = byFold.get(row.rowid);
          if (item) {
            seen.add(row.rowid);
            found.push(item);
            if (found.length >= safeLimit) break;
          }
        }
      }
      return found;
    };

    // Strict AND first; if it yields nothing, fall back once to the loose OR form.
    const strict = run(ftsQuery(query));
    return strict.length > 0 ? strict : run(ftsQuery(query, true));
  }

  /* ---------------- edges ---------------- */

  insertEdge(e: ContextEdge): void {
    const from = this.getItem(e.from_id);
    const to = this.getItem(e.to_id);
    if (!from || !to || from.space_id !== to.space_id) {
      throw new Error("edge endpoints must belong to the same space");
    }
    this.sql.exec(
      `INSERT INTO edges (id, from_id, to_id, relationship, weight, created_by, approval_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      e.id,
      e.from_id,
      e.to_id,
      e.relationship,
      e.weight,
      e.created_by,
      e.approval_state,
      e.created_at,
    );
  }

  /** True if an edge already links these two items with this relationship (either direction). */
  edgeExists(a: string, b: string, relationship: string): boolean {
    return (
      (this.sql
        .exec<{ n: number }>(
          `SELECT COUNT(*) AS n FROM edges
           WHERE relationship = ?
             AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
          relationship,
          a,
          b,
          b,
          a,
        )
        .toArray()[0]?.n ?? 0) > 0
    );
  }

  edgesFrom(itemId: string): ContextEdge[] {
    return this.sql
      .exec<EdgeRow>(
        `SELECT * FROM edges WHERE (from_id = ? OR to_id = ?) AND approval_state = 'approved'`,
        itemId,
        itemId,
      )
      .toArray()
      .map(toEdge);
  }

  listEdgesForItems(itemIds: string[]): ContextEdge[] {
    if (itemIds.length === 0) return [];
    const placeholders = itemIds.map(() => "?").join(",");
    return this.sql
      .exec<EdgeRow>(
        `SELECT * FROM edges WHERE from_id IN (${placeholders}) OR to_id IN (${placeholders})`,
        ...itemIds,
        ...itemIds,
      )
      .toArray()
      .map(toEdge);
  }

  /** Every edge touching an item, any approval state — for the item's Connections panel. */
  allEdgesForItem(itemId: string): ContextEdge[] {
    return this.sql
      .exec<EdgeRow>(
        `SELECT * FROM edges WHERE from_id = ? OR to_id = ? ORDER BY created_at DESC`,
        itemId,
        itemId,
      )
      .toArray()
      .map(toEdge);
  }

  getEdge(id: string): ContextEdge | null {
    const row = this.sql.exec<EdgeRow>(`SELECT * FROM edges WHERE id = ?`, id).toArray()[0];
    return row ? toEdge(row) : null;
  }

  setEdgeApproval(id: string, state: ContextEdge["approval_state"]): void {
    this.sql.exec(`UPDATE edges SET approval_state = ? WHERE id = ?`, state, id);
  }

  deleteEdge(id: string): void {
    this.sql.exec(`DELETE FROM edges WHERE id = ?`, id);
  }

  /* ---------------- item notes ---------------- */

  insertItemNote(n: ItemNote): void {
    this.sql.exec(
      `INSERT INTO item_notes (id, item_id, space_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      n.id,
      n.item_id,
      n.space_id,
      n.author_id,
      n.body,
      n.created_at,
    );
  }

  listItemNotes(itemId: string): ItemNote[] {
    return this.sql
      .exec<ItemNoteRow>(`SELECT * FROM item_notes WHERE item_id = ? ORDER BY created_at`, itemId)
      .toArray()
      .map((r) => ({ ...r }));
  }

  getItemNote(id: string): ItemNote | null {
    const row = this.sql.exec<ItemNoteRow>(`SELECT * FROM item_notes WHERE id = ?`, id).toArray()[0];
    return row ? { ...row } : null;
  }

  deleteItemNote(id: string): void {
    this.sql.exec(`DELETE FROM item_notes WHERE id = ?`, id);
  }

  /* ---------------- tasks ---------------- */

  insertTask(t: Task): void {
    this.sql.exec(
      `INSERT INTO tasks (id, space_id, project_id, human_id, title, instruction, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.space_id,
      t.project_id ?? null,
      t.human_id,
      t.title,
      t.instruction,
      t.status,
      t.created_at,
      t.expires_at,
    );
  }

  getTask(id: string): Task | null {
    const row = this.sql
      .exec<TaskRow>(`SELECT * FROM tasks WHERE id = ?`, id)
      .toArray()[0];
    return row ? toTask(row) : null;
  }

  listTasks(spaceId: string): Task[] {
    return this.sql
      .exec<TaskRow>(`SELECT * FROM tasks WHERE space_id = ?`, spaceId)
      .toArray()
      .map(toTask);
  }

  setTaskStatus(id: string, status: Task["status"]): void {
    this.sql.exec(`UPDATE tasks SET status = ? WHERE id = ?`, status, id);
  }

  updateTask(
    id: string,
    changes: { title?: string; instruction?: string; project_id?: string | null; expires_at?: number | null },
  ): void {
    const sets: string[] = [];
    const args: SqlStorageValue[] = [];
    if (changes.title !== undefined) {
      sets.push("title = ?");
      args.push(changes.title);
    }
    if (changes.instruction !== undefined) {
      sets.push("instruction = ?");
      args.push(changes.instruction);
    }
    if (changes.project_id !== undefined) {
      sets.push("project_id = ?");
      args.push(changes.project_id);
    }
    if (changes.expires_at !== undefined) {
      sets.push("expires_at = ?");
      args.push(changes.expires_at);
    }
    if (sets.length === 0) return;
    args.push(id);
    this.sql.exec(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, ...args);
  }

  /* ---------------- grants ---------------- */

  insertGrant(g: Grant): void {
    this.sql.exec(
      `INSERT INTO grants (id, task_id, space_id, region_id, level, grantor_id, created_at, expires_at, revoked_at, revoked_by, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      g.id,
      g.task_id,
      g.space_id,
      g.region_id,
      g.level,
      g.grantor_id,
      g.created_at,
      g.expires_at,
      g.revoked_at,
      g.revoked_by,
      g.reason,
    );
  }

  getGrant(id: string): Grant | null {
    const row = this.sql
      .exec<GrantRow>(`SELECT * FROM grants WHERE id = ?`, id)
      .toArray()[0];
    return row ? toGrant(row) : null;
  }

  grantsForTask(taskId: string): Grant[] {
    return this.sql
      .exec<GrantRow>(`SELECT * FROM grants WHERE task_id = ?`, taskId)
      .toArray()
      .map(toGrant);
  }

  revokeGrant(id: string, revokedBy: string, reason: string | null, now: number): void {
    this.sql.exec(
      `UPDATE grants SET revoked_at = ?, revoked_by = ?, reason = ? WHERE id = ?`,
      now,
      revokedBy,
      reason,
      id,
    );
  }

  /* ---------------- agent sessions ---------------- */

  insertAgentSession(s: AgentSession): void {
    this.sql.exec(
      `INSERT INTO agent_sessions (id, human_id, task_id, declared, created_at) VALUES (?, ?, ?, ?, ?)`,
      s.id,
      s.human_id,
      s.task_id,
      s.declared ? JSON.stringify(s.declared) : null,
      s.created_at,
    );
  }

  getAgentSession(id: string): AgentSession | null {
    const row = this.sql
      .exec<AgentSessionRow>(`SELECT * FROM agent_sessions WHERE id = ?`, id)
      .toArray()[0];
    return row ? toAgentSession(row) : null;
  }

  /** Self-declared client identity. Attribution only — never an auth input. */
  setAgentSessionDeclared(id: string, declared: NonNullable<AgentSession["declared"]>): void {
    this.sql.exec(`UPDATE agent_sessions SET declared = ? WHERE id = ?`, JSON.stringify(declared), id);
  }

  listAgentSessions(spaceId: string): AgentSession[] {
    return this.sql
      .exec<AgentSessionRow>(
        `SELECT s.* FROM agent_sessions s JOIN tasks t ON t.id = s.task_id WHERE t.space_id = ?`,
        spaceId,
      )
      .toArray()
      .map(toAgentSession);
  }

  /* ---------------- artifacts ---------------- */

  insertArtifact(a: Artifact): void {
    this.sql.exec(
      `INSERT INTO artifacts (id, space_id, task_id, kind, title, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      a.id,
      a.space_id,
      a.task_id,
      a.kind,
      a.title,
      a.created_at,
    );
  }

  getArtifact(id: string): Artifact | null {
    const row = this.sql
      .exec<ArtifactRow>(`SELECT * FROM artifacts WHERE id = ?`, id)
      .toArray()[0];
    return row ? toArtifact(row) : null;
  }

  listArtifacts(spaceId: string): Artifact[] {
    return this.sql
      .exec<ArtifactRow>(`SELECT * FROM artifacts WHERE space_id = ?`, spaceId)
      .toArray()
      .map(toArtifact);
  }

  insertArtifactVersion(v: ArtifactVersion): void {
    this.sql.exec(
      `INSERT INTO artifact_versions (id, artifact_id, version_no, parent_version_id, content_html, agent_session_id, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      v.id,
      v.artifact_id,
      v.version_no,
      v.parent_version_id,
      v.content_html,
      v.agent_session_id,
      v.state,
      v.created_at,
    );
  }

  getArtifactVersion(id: string): ArtifactVersion | null {
    const row = this.sql
      .exec<ArtifactVersionRow>(`SELECT * FROM artifact_versions WHERE id = ?`, id)
      .toArray()[0];
    return row ? toArtifactVersion(row) : null;
  }

  listArtifactVersions(artifactId: string): ArtifactVersion[] {
    return this.sql
      .exec<ArtifactVersionRow>(
        `SELECT * FROM artifact_versions WHERE artifact_id = ? ORDER BY version_no`,
        artifactId,
      )
      .toArray()
      .map(toArtifactVersion);
  }

  latestArtifactVersion(artifactId: string): ArtifactVersion | null {
    const row = this.sql
      .exec<ArtifactVersionRow>(
        `SELECT * FROM artifact_versions WHERE artifact_id = ? ORDER BY version_no DESC LIMIT 1`,
        artifactId,
      )
      .toArray()[0];
    return row ? toArtifactVersion(row) : null;
  }

  setArtifactVersionState(id: string, state: ArtifactState): void {
    this.sql.exec(`UPDATE artifact_versions SET state = ? WHERE id = ?`, state, id);
  }

  /** Remove an artifact and its dependent review/provenance rows as one owned unit. */
  deleteArtifact(id: string): void {
    // Versions reference their parent versions, so clear internal links before
    // removing the immutable history itself.
    this.sql.exec(`UPDATE artifact_versions SET parent_version_id = NULL WHERE artifact_id = ?`, id);
    this.sql.exec(`DELETE FROM taste_evidence WHERE version_id IN (SELECT id FROM artifact_versions WHERE artifact_id = ?)`, id);
    this.sql.exec(`DELETE FROM taste_events WHERE version_id IN (SELECT id FROM artifact_versions WHERE artifact_id = ?)`, id);
    this.sql.exec(`DELETE FROM annotations WHERE version_id IN (SELECT id FROM artifact_versions WHERE artifact_id = ?)`, id);
    this.sql.exec(`DELETE FROM decisions WHERE version_id IN (SELECT id FROM artifact_versions WHERE artifact_id = ?)`, id);
    this.sql.exec(`DELETE FROM influences WHERE version_id IN (SELECT id FROM artifact_versions WHERE artifact_id = ?)`, id);
    this.sql.exec(`DELETE FROM artifact_versions WHERE artifact_id = ?`, id);
    this.sql.exec(`DELETE FROM artifacts WHERE id = ?`, id);
  }

  /* ---------------- influences / accesses / denials ---------------- */

  insertInfluence(i: InfluenceRecord): void {
    this.sql.exec(
      `INSERT INTO influences (id, version_id, item_id, role, strength, note) VALUES (?, ?, ?, ?, ?, ?)`,
      i.id,
      i.version_id,
      i.item_id,
      i.role,
      i.strength,
      i.note,
    );
  }

  listInfluences(versionId: string): InfluenceRecord[] {
    return this.sql
      .exec<InfluenceRow>(`SELECT * FROM influences WHERE version_id = ?`, versionId)
      .toArray()
      .map(toInfluence);
  }

  insertAccess(a: AccessRecord): void {
    this.insertAccesses([a]);
  }

  /** Batch form of insertAccess — one multi-row insert instead of N. */
  insertAccesses(rows: AccessRecord[]): void {
    if (rows.length === 0) return;
    const tuples = rows.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const args = rows.flatMap((a) => [
      a.id,
      a.task_id,
      a.item_id,
      a.tool_name,
      a.at,
      a.why ?? null,
      JSON.stringify(a.applied_signal_ids ?? []),
    ]);
    this.sql.exec(
      `INSERT INTO accesses (id, task_id, item_id, tool_name, at, why, applied_signal_ids) VALUES ${tuples}`,
      ...args,
    );
  }

  recentAccesses(taskId: string, limit: number): AccessRecord[] {
    return this.sql
      .exec<AccessRow>(
        `SELECT * FROM accesses WHERE task_id = ? ORDER BY at DESC LIMIT ?`,
        taskId,
        limit,
      )
      .toArray()
      .map(toAccess);
  }

  /** Every access across the space (joined through tasks), newest first. */
  spaceAccesses(spaceId: string, limit = 500): AccessRecord[] {
    return this.sql
      .exec<AccessRow>(
        `SELECT a.* FROM accesses a JOIN tasks t ON t.id = a.task_id WHERE t.space_id = ? ORDER BY a.at DESC LIMIT ?`,
        spaceId,
        limit,
      )
      .toArray()
      .map(toAccess);
  }

  /** Every audit event across the space (joined through tasks), newest first. */
  spaceAuditEvents(spaceId: string, limit = 500): AuditEvent[] {
    return this.sql
      .exec<AuditEventRow>(
        `SELECT a.* FROM audit_events a JOIN tasks t ON t.id = a.task_id WHERE t.space_id = ? ORDER BY a.at DESC LIMIT ?`,
        spaceId,
        limit,
      )
      .toArray()
      .map(toAuditEvent);
  }

  /** All taste "applied" events across the space, for per-agent attribution. */
  spaceTasteApplications(spaceId: string): TasteEvent[] {
    return this.sql
      .exec<TasteEventRow>(
        `SELECT e.* FROM taste_events e JOIN taste_signals s ON s.id = e.signal_id
         WHERE s.space_id = ? AND e.kind = 'applied' ORDER BY e.at DESC`,
        spaceId,
      )
      .toArray()
      .map(toTasteEvent);
  }

  insertDenial(d: DenialRecord): void {
    this.sql.exec(
      `INSERT INTO denials (id, task_id, agent_session_id, tool_name, requested, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      d.id,
      d.task_id,
      d.agent_session_id,
      d.tool_name,
      JSON.stringify(d.requested),
      d.reason,
      d.at,
    );
  }

  recentDenials(taskId: string, limit: number): DenialRecord[] {
    return this.sql
      .exec<DenialRow>(
        `SELECT * FROM denials WHERE task_id = ? ORDER BY at DESC LIMIT ?`,
        taskId,
        limit,
      )
      .toArray()
      .map(toDenial);
  }

  /* ---------------- annotations / decisions ---------------- */

  insertAnnotation(a: Annotation): void {
    this.sql.exec(
      `INSERT INTO annotations (id, version_id, author_id, target, sentiment, dimension, dimensions, comment, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.id,
      a.version_id,
      a.author_id,
      a.target ? JSON.stringify(a.target) : null,
      a.sentiment,
      a.dimensions[0] ?? null,
      JSON.stringify(a.dimensions),
      a.comment,
      a.status,
      a.created_at,
    );
  }

  /** Edit a person's own note. Only the passed fields change. */
  updateAnnotation(
    id: string,
    changes: { comment?: string; sentiment?: Annotation["sentiment"]; dimensions?: Annotation["dimensions"] },
  ): void {
    const sets: string[] = [];
    const args: SqlStorageValue[] = [];
    if (changes.comment !== undefined) { sets.push("comment = ?"); args.push(changes.comment); }
    if (changes.sentiment !== undefined) { sets.push("sentiment = ?"); args.push(changes.sentiment); }
    if (changes.dimensions !== undefined) {
      sets.push("dimension = ?", "dimensions = ?");
      args.push(changes.dimensions[0] ?? null, JSON.stringify(changes.dimensions));
    }
    if (sets.length === 0) return;
    args.push(id);
    this.sql.exec(`UPDATE annotations SET ${sets.join(", ")} WHERE id = ?`, ...args);
  }

  listAnnotations(versionId: string): Annotation[] {
    return this.sql
      .exec<AnnotationRow>(`SELECT * FROM annotations WHERE version_id = ?`, versionId)
      .toArray()
      .map(toAnnotation);
  }

  setItemContentRef(id: string, contentRef: string): void {
    this.sql.exec(
      `UPDATE items SET content_ref = ?, updated_at = ? WHERE id = ?`,
      contentRef,
      Date.now(),
      id,
    );
  }

  getAnnotation(id: string): Annotation | null {
    const row = this.sql
      .exec<AnnotationRow>(`SELECT * FROM annotations WHERE id = ?`, id)
      .toArray()[0];
    return row ? toAnnotation(row) : null;
  }

  insertDecision(d: DecisionRecord): void {
    this.sql.exec(
      `INSERT INTO decisions (id, version_id, actor_id, decision, note, prev_state, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      d.id,
      d.version_id,
      d.actor_id,
      d.decision,
      d.note,
      d.prev_state,
      d.at,
    );
  }

  listDecisions(versionId: string): DecisionRecord[] {
    return this.sql
      .exec<DecisionRow>(`SELECT * FROM decisions WHERE version_id = ?`, versionId)
      .toArray()
      .map(toDecision);
  }

  /* ---------------- taste ---------------- */

  insertTasteSignal(t: TasteSignal): void {
    const inferredProjectId =
      t.created_by === "system" && t.project_id === undefined ? this.tasteDerivationProjectId ?? null : null;
    const requestedProjectId = t.scope === "project" ? t.project_id ?? inferredProjectId : null;
    const project = requestedProjectId ? this.getProject(requestedProjectId) : null;
    const projectIsOwned = Boolean(
      project && project.space_id === t.space_id && project.owner_id === t.owner_id,
    );
    const scope = projectIsOwned ? "project" : "personal";
    const projectId = projectIsOwned ? requestedProjectId : null;
    this.sql.exec(
      `INSERT INTO taste_signals (id, space_id, project_id, owner_id, statement, dimensions, scope, status, confidence, created_by, approved_by, created_at, supersedes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.space_id,
      projectId,
      t.owner_id,
      t.statement,
      JSON.stringify(t.dimensions),
      scope,
      t.status,
      t.confidence,
      t.created_by,
      t.approved_by,
      t.created_at,
      t.supersedes ?? null,
    );
  }

  listTasteSignals(spaceId: string): TasteSignal[] {
    return this.sql
      .exec<TasteSignalRow>(`SELECT * FROM taste_signals WHERE space_id = ?`, spaceId)
      .toArray()
      .map(toTasteSignal);
  }

  getTasteSignal(id: string): TasteSignal | null {
    const row = this.sql
      .exec<TasteSignalRow>(`SELECT * FROM taste_signals WHERE id = ?`, id)
      .toArray()[0];
    return row ? toTasteSignal(row) : null;
  }

  setTasteSignalStatus(id: string, status: TasteSignal["status"], approvedBy: string | null): void {
    this.sql.exec(
      `UPDATE taste_signals SET status = ?, approved_by = ? WHERE id = ?`,
      status,
      approvedBy,
      id,
    );
  }

  /** Editing a proposal's wording is a review action, not a status change. */
  setTasteSignalStatement(id: string, statement: string): void {
    this.sql.exec(`UPDATE taste_signals SET statement = ? WHERE id = ?`, statement, id);
  }

  setTasteSignalScope(id: string, scope: TasteSignal["scope"]): void {
    if (scope === "personal") {
      this.sql.exec(`UPDATE taste_signals SET scope = 'personal', project_id = NULL WHERE id = ?`, id);
      return;
    }
    this.sql.exec(`UPDATE taste_signals SET scope = ? WHERE id = ?`, scope, id);
  }

  setTasteSignalProject(id: string, projectId: string | null): void {
    if (projectId === null) {
      this.sql.exec(`UPDATE taste_signals SET scope = 'personal', project_id = NULL WHERE id = ?`, id);
      return;
    }
    this.sql.exec(`UPDATE taste_signals SET scope = 'project', project_id = ? WHERE id = ?`, projectId, id);
  }

  insertTasteEvidence(e: TasteEvidence): void {
    this.sql.exec(
      `INSERT INTO taste_evidence (id, signal_id, kind, annotation_id, version_id, item_id) VALUES (?, ?, ?, ?, ?, ?)`,
      e.id,
      e.signal_id,
      e.kind,
      e.annotation_id,
      e.version_id,
      e.item_id,
    );
  }

  listTasteEvidence(signalId: string): TasteEvidence[] {
    return this.sql
      .exec<TasteEvidenceRow>(`SELECT * FROM taste_evidence WHERE signal_id = ?`, signalId)
      .toArray()
      .map(toTasteEvidence);
  }

  setTasteEvidenceKind(id: string, kind: TasteEvidence["kind"]): void {
    this.sql.exec(`UPDATE taste_evidence SET kind = ? WHERE id = ?`, kind, id);
  }

  deleteTasteEvidence(id: string): void {
    this.sql.exec(`DELETE FROM taste_evidence WHERE id = ?`, id);
  }

  /** Copy evidence links to a replacement signal without changing their source rows. */
  copyTasteEvidence(fromSignalId: string, toSignalId: string): void {
    const rows = this.listTasteEvidence(fromSignalId);
    for (const row of rows) {
      this.insertTasteEvidence({ ...row, id: crypto.randomUUID(), signal_id: toSignalId });
    }
  }

  insertTasteEvent(e: TasteEvent): void {
    this.sql.exec(
      `INSERT INTO taste_events (id, signal_id, kind, actor_type, actor_label, agent_session_id, detail, version_id, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      e.id,
      e.signal_id,
      e.kind,
      e.actor_type,
      e.actor_label,
      e.agent_session_id,
      e.detail,
      e.version_id,
      e.at,
    );
  }

  listTasteEvents(signalId: string): TasteEvent[] {
    return this.sql
      .exec<TasteEventRow>(`SELECT * FROM taste_events WHERE signal_id = ? ORDER BY at`, signalId)
      .toArray()
      .map(toTasteEvent);
  }

  /** Space-wide taste activity feed, newest first. */
  recentTasteEvents(spaceId: string, limit: number): (TasteEvent & { statement: string })[] {
    return this.sql
      .exec<TasteEventRow & { statement: string }>(
        `SELECT e.*, s.statement AS statement
         FROM taste_events e JOIN taste_signals s ON s.id = e.signal_id
         WHERE s.space_id = ? ORDER BY e.at DESC LIMIT ?`,
        spaceId,
        limit,
      )
      .toArray()
      .map((r) => ({ ...toTasteEvent(r), statement: r.statement }));
  }

  /** supporting / contradicting evidence counts for a signal. */
  tasteEvidenceCounts(signalId: string): { supporting: number; contradicting: number } {
    const rows = this.sql
      .exec<{ kind: string; n: number }>(
        `SELECT kind, COUNT(*) AS n FROM taste_evidence WHERE signal_id = ? GROUP BY kind`,
        signalId,
      )
      .toArray();
    const get = (k: string) => rows.find((r) => r.kind === k)?.n ?? 0;
    return { supporting: get("supports"), contradicting: get("contradicts") };
  }

  setTasteSignalConfidence(id: string, confidence: number): void {
    this.sql.exec(`UPDATE taste_signals SET confidence = ? WHERE id = ?`, confidence, id);
  }

  /** Bitemporal replace: old row → superseded, new row records the link. */
  supersedeTasteSignal(oldId: string, newId: string): void {
    this.sql.exec(`UPDATE taste_signals SET status = 'superseded' WHERE id = ?`, oldId);
    this.sql.exec(`UPDATE taste_signals SET supersedes = ? WHERE id = ?`, oldId, newId);
  }

  confirmedTasteSignals(spaceId: string): TasteSignal[] {
    return this.sql
      .exec<TasteSignalRow>(
        `SELECT * FROM taste_signals WHERE space_id = ? AND status = 'confirmed'`,
        spaceId,
      )
      .toArray()
      .map(toTasteSignal);
  }

  /**
   * Every open annotation in a space that taste derivation may learn from.
   *
   * The version must be agent-authored and grounded in real Archive material
   * (an influence row) — we never learn taste from ungrounded output. It must
   * also carry a human decision: `changes_requested` is included alongside the
   * approved states because "annotate → request changes → a taste signal is
   * proposed → confirm it → the agent revises" is the core learning loop, and
   * `handleDecisions` derives immediately after setting that state.
   */
  openAnnotationsForSpace(spaceId: string): (Annotation & { space_id: string })[] {
    const rows = this.sql
      .exec<AnnotationRow & { space_id: string; project_id: string | null }>(
        `SELECT a.*, ar.space_id AS space_id, t.project_id AS project_id
         FROM annotations a
         JOIN artifact_versions av ON av.id = a.version_id
         JOIN artifacts ar ON ar.id = av.artifact_id
         JOIN tasks t ON t.id = ar.task_id
         WHERE ar.space_id = ?
           AND t.space_id = ar.space_id
           AND t.human_id = (SELECT owner_id FROM spaces WHERE id = ar.space_id)
           AND a.status = 'open'
           AND a.author_id NOT LIKE 'agent:%'
           AND av.state IN ('approved', 'approved_with_notes', 'changes_requested')
           AND av.agent_session_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM influences i WHERE i.version_id = av.id)
         ORDER BY a.created_at DESC, a.id DESC`,
        spaceId,
      )
      .toArray()
      .map((r) => ({ ...toAnnotation(r), space_id: r.space_id, project_id: r.project_id ?? null }));

    // deriveTasteSignals groups only by dimension and sentiment and cannot take
    // a project argument. Feed one task scope per run (the newest human note)
    // so evidence from two projects can never be merged into one signal. The
    // insertTasteSignal method consumes this private, synchronous context.
    const projectId = rows[0]?.project_id ?? null;
    this.tasteDerivationProjectId = rows.length > 0 ? projectId : undefined;
    return rows.filter((row) => (row.project_id ?? null) === projectId);
  }

  /* ---------------- audit ---------------- */

  insertAuditEvent(e: AuditEvent): void {
    this.sql.exec(
      `INSERT INTO audit_events (id, actor_type, actor_label, agent_session_id, human_id, task_id, tool_name, operation, payload, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      e.id,
      e.actor_type,
      e.actor_label,
      e.agent_session_id,
      e.human_id,
      e.task_id,
      e.tool_name,
      e.operation,
      JSON.stringify(e.payload),
      e.at,
    );
  }

  recentAuditEvents(taskId: string, limit: number): AuditEvent[] {
    return this.sql
      .exec<AuditEventRow>(
        `SELECT * FROM audit_events WHERE task_id = ? ORDER BY at DESC LIMIT ?`,
        taskId,
        limit,
      )
      .toArray()
      .map(toAuditEvent);
  }

  /* ---------------- beta membership + usage quota ---------------- */

  betaMemberCount(): number {
    return (
      this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM beta_members`).toArray()[0]?.n ?? 0
    );
  }

  betaSlot(humanId: string): number | null {
    const row = this.sql
      .exec<{ slot_no: number }>(`SELECT slot_no FROM beta_members WHERE human_id = ?`, humanId)
      .toArray()[0];
    return row ? row.slot_no : null;
  }

  /** Claim a beta slot if one is free. Returns the slot number, or null if full. */
  claimBetaSlot(humanId: string, max: number, now: number): number | null {
    const existing = this.betaSlot(humanId);
    if (existing !== null) return existing;
    const taken = this.betaMemberCount();
    if (taken >= max) return null;
    const slot = taken + 1;
    this.sql.exec(
      `INSERT INTO beta_members (human_id, slot_no, joined_at) VALUES (?, ?, ?)`,
      humanId,
      slot,
      now,
    );
    return slot;
  }

  usageGet(humanId: string, period: string, metric: string): number {
    const row = this.sql
      .exec<{ used: number }>(
        `SELECT used FROM usage_counters WHERE human_id = ? AND period = ? AND metric = ?`,
        humanId,
        period,
        metric,
      )
      .toArray()[0];
    return row ? row.used : 0;
  }

  usageAdd(humanId: string, period: string, metric: string, n: number): void {
    this.sql.exec(
      `INSERT INTO usage_counters (human_id, period, metric, used) VALUES (?, ?, ?, ?)
       ON CONFLICT (human_id, period, metric) DO UPDATE SET used = used + excluded.used`,
      humanId,
      period,
      metric,
      n,
    );
  }

  usageForPeriod(humanId: string, period: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.sql
      .exec<{ metric: string; used: number }>(
        `SELECT metric, used FROM usage_counters WHERE human_id = ? AND period = ?`,
        humanId,
        period,
      )
      .toArray()) {
      out[r.metric] = r.used;
    }
    return out;
  }

  /* ---------------- memory outbox (external index mirror) ---------------- */

  enqueueMemoryOp(job: {
    space_id: string;
    op: "upsert" | "delete";
    item_id: string;
    payload: MemoryOutboxPayload;
    doc_id?: string | null;
    now: number;
  }): void {
    this.sql.exec(
      `INSERT INTO memory_outbox
         (id, space_id, op, item_id, custom_id, container_tag, payload, status, attempts, doc_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
      crypto.randomUUID(),
      job.space_id,
      job.op,
      job.item_id,
      job.item_id,
      job.space_id,
      JSON.stringify(job.payload),
      job.doc_id ?? null,
      job.now,
      job.now,
    );
  }

  listPendingMemoryOps(limit: number): MemoryOutboxJob[] {
    return this.sql
      .exec<MemoryOutboxRow>(
        `SELECT * FROM memory_outbox WHERE status = 'pending' ORDER BY updated_at, id LIMIT ?`,
        Math.max(1, Math.floor(limit)),
      )
      .toArray()
      .map(toMemoryOutboxJob);
  }

  countPendingMemoryOps(): number {
    return (
      this.sql
        .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM memory_outbox WHERE status = 'pending'`)
        .toArray()[0]?.n ?? 0
    );
  }

  markMemoryOpDone(id: string, docId: string | null, now: number): void {
    this.sql.exec(
      `UPDATE memory_outbox SET status = 'done', doc_id = COALESCE(?, doc_id), last_error = NULL, updated_at = ? WHERE id = ?`,
      docId,
      now,
      id,
    );
  }

  /** Bump the attempt count; park as 'failed' once it reaches maxAttempts. */
  markMemoryOpRetry(id: string, reason: string, maxAttempts: number, now: number): void {
    this.sql.exec(
      `UPDATE memory_outbox
         SET attempts = attempts + 1,
             last_error = ?,
             status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END,
             updated_at = ?
       WHERE id = ?`,
      reason.slice(0, 500),
      Math.max(1, Math.floor(maxAttempts)),
      now,
      id,
    );
  }

  markMemoryOpFailed(id: string, reason: string, now: number): void {
    this.sql.exec(
      `UPDATE memory_outbox SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`,
      reason.slice(0, 500),
      now,
      id,
    );
  }
}

/**
 * items_fts is content-less (content=''), so it needs an explicit rowid we
 * fully control. Items already have a stable text id; fold it to a 63-bit
 * integer so fts5 rowid math works, and reuse the identical fold for lookup,
 * update, and delete.
 *
 * ponytail: multiplicative fold mod MAX_SAFE_INTEGER with no collision handling.
 * Birthday-collision odds are negligible below ~10k items per space; if a space
 * gets large, add a real surrogate-key column or move items_fts to a proper
 * external-content table keyed on the sequential rowid.
 */
export function rowidFor(itemId: string): number {
  let hash = 0n;
  for (let i = 0; i < itemId.length; i++) {
    hash = (hash * 131n + BigInt(itemId.charCodeAt(i))) & 0x7fffffffffffffffn;
  }
  return Number(hash % 9007199254740991n);
}

/**
 * Turn free text into an fts5 MATCH query: quote each token, AND them together,
 * and prefix-wildcard only the last token. `loose` switches to the old form —
 * every token prefix-wildcarded and OR'd — for the fallback in searchItems().
 */
function ftsQuery(input: string, loose = false): string {
  const tokens = input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/["]/g, ""));
  if (tokens.length === 0) return '""';
  if (loose) return tokens.map((t) => `"${t}"*`).join(" OR ");
  return tokens
    .map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`))
    .join(" AND ");
}
