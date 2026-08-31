/**
 * Typed data access over a SpaceDO's this.ctx.storage.sql.
 * One SqlStorage per Space (per DO instance) — space_id columns still stored
 * for shape-fidelity with the shared contract, but every query here is scoped
 * to the single space living in this DO.
 */
import type {
  Space,
  Region,
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
  owner_id: string;
  statement: string;
  dimensions: string;
  scope: string;
  status: string;
  confidence: number;
  created_by: string;
  approved_by: string | null;
  created_at: number;
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
  return { ...r, status: r.status as Task["status"] };
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
  return { ...r };
}
function toDenial(r: DenialRow): DenialRecord {
  return {
    ...r,
    requested: JSON.parse(r.requested) as Record<string, unknown>,
  };
}
function toAnnotation(r: AnnotationRow): Annotation {
  return {
    ...r,
    target: r.target ? (JSON.parse(r.target) as Annotation["target"]) : null,
    sentiment: r.sentiment as Annotation["sentiment"],
    status: r.status as Annotation["status"],
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
  };
}
function toTasteEvidence(r: TasteEvidenceRow): TasteEvidence {
  return { ...r, kind: r.kind as TasteEvidence["kind"] };
}
function toAuditEvent(r: AuditEventRow): AuditEvent {
  return {
    ...r,
    actor_type: r.actor_type as AuditEvent["actor_type"],
    payload: JSON.parse(r.payload) as Record<string, unknown>,
  };
}

export class Queries {
  constructor(private sql: SqlStorage) {}

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
  }

  updateItem(item: ContextItem): void {
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
    this.sql.exec(
      `UPDATE items_fts SET title = ?, semantic_text = ? WHERE rowid = ?`,
      item.title,
      item.semantic_text ?? "",
      rowidFor(item.id),
    );
  }

  deleteItem(id: string): void {
    this.sql.exec(`DELETE FROM items WHERE id = ?`, id);
    this.sql.exec(`DELETE FROM items_fts WHERE rowid = ?`, rowidFor(id));
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

  /** FTS match, restricted to a set of allowed region ids (hard pre-filter). */
  searchItems(query: string, allowedRegionIds: string[], limit: number): ContextItem[] {
    if (allowedRegionIds.length === 0 || query.trim() === "") return [];
    const placeholders = allowedRegionIds.map(() => "?").join(",");
    const rows = this.sql
      .exec<ItemRow>(
        `SELECT items.* FROM items_fts
         JOIN items ON items.rowid = items_fts.rowid
         WHERE items_fts MATCH ? AND items.region_id IN (${placeholders})
         ORDER BY rank LIMIT ?`,
        ftsQuery(query),
        ...allowedRegionIds,
        limit,
      )
      .toArray();
    return rows.map(toItem);
  }

  /* ---------------- edges ---------------- */

  insertEdge(e: ContextEdge): void {
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

  /* ---------------- tasks ---------------- */

  insertTask(t: Task): void {
    this.sql.exec(
      `INSERT INTO tasks (id, space_id, human_id, title, instruction, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.space_id,
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
    this.sql.exec(
      `INSERT INTO accesses (id, task_id, item_id, tool_name, at) VALUES (?, ?, ?, ?, ?)`,
      a.id,
      a.task_id,
      a.item_id,
      a.tool_name,
      a.at,
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
      `INSERT INTO annotations (id, version_id, author_id, target, sentiment, dimension, comment, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.id,
      a.version_id,
      a.author_id,
      a.target ? JSON.stringify(a.target) : null,
      a.sentiment,
      a.dimension,
      a.comment,
      a.status,
      a.created_at,
    );
  }

  listAnnotations(versionId: string): Annotation[] {
    return this.sql
      .exec<AnnotationRow>(`SELECT * FROM annotations WHERE version_id = ?`, versionId)
      .toArray()
      .map(toAnnotation);
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
    this.sql.exec(
      `INSERT INTO taste_signals (id, space_id, owner_id, statement, dimensions, scope, status, confidence, created_by, approved_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.space_id,
      t.owner_id,
      t.statement,
      JSON.stringify(t.dimensions),
      t.scope,
      t.status,
      t.confidence,
      t.created_by,
      t.approved_by,
      t.created_at,
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
    this.sql.exec(`UPDATE taste_signals SET scope = ? WHERE id = ?`, scope, id);
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
}

/**
 * items_fts is content-less (content=''), so it needs an explicit rowid we
 * fully control. Items already have a stable text id; fold it to a 63-bit
 * integer so fts5 rowid math works, and reuse the identical fold for lookup,
 * update, and delete.
 */
function rowidFor(itemId: string): number {
  let hash = 0n;
  for (let i = 0; i < itemId.length; i++) {
    hash = (hash * 131n + BigInt(itemId.charCodeAt(i))) & 0x7fffffffffffffffn;
  }
  return Number(hash % 9007199254740991n);
}

/** Turn free text into an fts5 MATCH query: quote each token, OR them, prefix-match the last. */
function ftsQuery(input: string): string {
  const tokens = input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/["]/g, ""));
  if (tokens.length === 0) return '""';
  return tokens.map((t) => `"${t}"*`).join(" OR ");
}
