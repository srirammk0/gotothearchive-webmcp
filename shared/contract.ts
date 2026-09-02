/**
 * FROZEN BUILD CONTRACT — GoToTheArchive
 *
 * Every track compiles against this file. The central integration track may
 * evolve it when the product contract changes, with the matching schema and
 * focused documentation updated in the same change.
 *
 * See docs/technical/BUILD-CONTRACT.md for track ownership and rationale.
 */

/* ------------------------------------------------------------------ *
 * Identity & scope
 * ------------------------------------------------------------------ */

export type Id = string;

/** Agent authority levels. Ordered — higher index implies all lower powers. */
export const GRANT_LEVELS = ["none", "read", "propose", "write"] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

export function grantAtLeast(have: GrantLevel, need: GrantLevel): boolean {
  return GRANT_LEVELS.indexOf(have) >= GRANT_LEVELS.indexOf(need);
}

/** Plain-language labels. UI must use these, never the raw enum. */
export const GRANT_LABEL: Record<GrantLevel, string> = {
  none: "No access",
  read: "Can view",
  propose: "Can suggest changes",
  write: "Can edit directly",
};

/** Authority classes, ranked. Lower index = more authoritative. */
export const AUTHORITY_CLASSES = [
  "human_authored",
  "imported_source_linked",
  "human_confirmed_preference",
  /** Added directly by an agent into a folder the human granted write access to. */
  "agent_authored",
  "agent_artifact",
  "agent_proposal",
  "inferred_taste_signal",
] as const;
export type AuthorityClass = (typeof AUTHORITY_CLASSES)[number];

/** Whether an item/record was produced by an agent rather than the human. */
export function isAgentAuthority(c: string): boolean {
  return c === "agent_authored" || c === "agent_artifact" || c === "agent_proposal";
}

/* ------------------------------------------------------------------ *
 * Context graph
 * ------------------------------------------------------------------ */

export const RELATIONSHIPS = [
  "belongs_to",
  "related_to",
  "inspired_by",
  "influenced",
  "created_for",
  "mentions",
  "derived_from",
  "used_in",
  "authored_by",
  "supports",
  "contradicts",
  "approved_by",
  "rejected_because",
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

/** Traversal limits. Enforced server-side; not configurable by the agent. */
export const GRAPH_MAX_DEPTH = 3;
export const GRAPH_MAX_FANOUT = 12;
export const GRAPH_MAX_NODES = 60;

/* ------------------------------------------------------------------ *
 * Core entities
 * ------------------------------------------------------------------ */

export const ITEM_TYPES = [
  "note",
  "image",
  "screenshot",
  "link",
  "pdf",
  "document",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export interface Space {
  id: Id;
  name: string;
  owner_id: Id;
  kind: "personal" | "guest";
  created_at: number;
}

export interface Region {
  id: Id;
  space_id: Id;
  parent_id: Id | null;
  name: string;
  /** Stable lowercase key used in tool inputSchema enums. */
  slug: string;
  created_at: number;
}

/** A cross-cutting working grouping; membership is explicit and owned. */
export interface Project {
  id: Id;
  space_id: Id;
  owner_id: Id;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

/** One explicit Project membership, targeting either a Region or an Item. */
export interface ProjectMember {
  id: Id;
  project_id: Id;
  region_id: Id | null;
  item_id: Id | null;
  created_at: number;
}

export interface ContextItem {
  id: Id;
  space_id: Id;
  region_id: Id;
  owner_id: Id;
  type: ItemType;
  title: string;
  source_url: string | null;
  /** R2 object key for the canonical original, when there is one. */
  content_ref: string | null;
  /** Derived text used for search. Never replaces the canonical original. */
  semantic_text: string | null;
  metadata: Record<string, unknown>;
  authority_class: AuthorityClass;
  created_by: Id;
  created_at: number;
  updated_at: number;
}

export interface ContextEdge {
  id: Id;
  from_id: Id;
  to_id: Id;
  relationship: Relationship;
  weight: number;
  created_by: Id;
  approval_state: "approved" | "proposed" | "rejected";
  created_at: number;
}

/** A human-written note pinned to a single archived item. */
export interface ItemNote {
  id: Id;
  item_id: Id;
  space_id: Id;
  author_id: Id;
  body: string;
  created_at: number;
}

export interface Task {
  id: Id;
  space_id: Id;
  human_id: Id;
  title: string;
  instruction: string;
  status: "open" | "complete" | "cancelled";
  created_at: number;
  expires_at: number | null;
  /** Optional project scope. Database/API responses normalize this to null. */
  project_id?: Id | null;
}

export interface Grant {
  id: Id;
  task_id: Id;
  space_id: Id;
  region_id: Id;
  level: GrantLevel;
  grantor_id: Id;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  revoked_by: Id | null;
  reason: string | null;
}

export interface AgentSession {
  id: Id;
  human_id: Id;
  task_id: Id;
  /** Self-declared by the client. Useful for attribution, NEVER for authorization. */
  declared: { provider?: string; client?: string; model?: string } | null;
  created_at: number;
}

/* ------------------------------------------------------------------ *
 * Artifacts, provenance, review
 * ------------------------------------------------------------------ */

export type ArtifactState =
  | "processing"
  | "ready_for_review"
  | "in_review"
  | "approved"
  | "approved_with_notes"
  | "changes_requested"
  | "rejected";

export const REVIEW_DECISIONS = [
  "approve",
  "approve_with_notes",
  "request_changes",
  "reject",
] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface Artifact {
  id: Id;
  space_id: Id;
  task_id: Id;
  kind: "visual_brief";
  title: string;
  /** Set once at creation, never moved — an artifact belongs to exactly one folder. */
  region_id: Id | null;
  created_at: number;
}

/** Artifacts are immutable at the version level. Never mutate a row. */
export interface ArtifactVersion {
  id: Id;
  artifact_id: Id;
  version_no: number;
  parent_version_id: Id | null;
  content_html: string;
  agent_session_id: Id | null;
  state: ArtifactState;
  created_at: number;
}

/**
 * The three provenance record types are DISTINCT and must never be collapsed.
 *   influence → "Used these references"     (shaped the result)
 *   access    → "Accessed for this task"    (retrieved, not necessarily influential)
 *   denial    → "Unavailable or denied"     (Agent Lens only, never ordinary provenance)
 */
export interface InfluenceRecord {
  id: Id;
  version_id: Id;
  item_id: Id;
  role: string;
  strength: number;
  note: string | null;
}

export interface AccessRecord {
  id: Id;
  task_id: Id;
  item_id: Id;
  tool_name: string;
  at: number;
  /** Retrieval's plain-language reason this item came back (retrieve() only). */
  why?: string | null;
  /** Confirmed taste signal ids that lifted this item into the results. */
  applied_signal_ids?: Id[];
}

export interface DenialRecord {
  id: Id;
  task_id: Id | null;
  agent_session_id: Id | null;
  tool_name: string;
  requested: Record<string, unknown>;
  reason: string;
  at: number;
}

export interface Annotation {
  id: Id;
  version_id: Id;
  author_id: Id;
  /** null target = whole-artifact comment. */
  target: { kind: "region"; x: number; y: number; w: number; h: number } | null;
  sentiment: "positive" | "negative" | "neutral";
  /** Taste dimensions this note is tagged with. Feeds taste derivation per tag. */
  dimensions: TasteDimension[];
  comment: string;
  status: "open" | "resolved" | "superseded";
  created_at: number;
}

/** Every state transition records actor, time and previous state. */
export interface DecisionRecord {
  id: Id;
  version_id: Id;
  actor_id: Id;
  decision: ReviewDecision;
  note: string | null;
  prev_state: ArtifactState;
  at: number;
}

/* ------------------------------------------------------------------ *
 * Taste
 * ------------------------------------------------------------------ */

export const TASTE_DIMENSIONS = [
  "typography",
  "composition",
  "layout_density",
  "color",
  "imagery",
  "motion",
  "visual_hierarchy",
  "tone_voice",
  "structure_clarity",
] as const;
export type TasteDimension = (typeof TASTE_DIMENSIONS)[number];

/** Display labels for the taste dimensions. Stored values stay snake_case. */
export const DIMENSION_LABELS: Record<TasteDimension, string> = {
  typography: "Typography",
  composition: "Composition",
  layout_density: "Layout density",
  color: "Color",
  imagery: "Imagery",
  motion: "Motion",
  visual_hierarchy: "Visual hierarchy",
  tone_voice: "Tone & voice",
  structure_clarity: "Structure & clarity",
};

/** Humanize a dimension slug for display; unknown slugs fall back to spaced words. */
export function dimensionLabel(d: string): string {
  return DIMENSION_LABELS[d as TasteDimension] ?? d.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export interface TasteSignal {
  id: Id;
  space_id: Id;
  owner_id: Id;
  /** Must be specific and contextual. Not "likes minimal design". */
  statement: string;
  dimensions: TasteDimension[];
  scope: "personal" | "project";
  status: "proposed" | "confirmed" | "rejected" | "superseded";
  /** Derived from evidence counts, never a literal. See confidenceFrom(). */
  confidence: number;
  created_by: "system" | "human";
  approved_by: Id | null;
  created_at: number;
  /** Bitemporal: id of the signal this one replaces, or null. */
  supersedes: Id | null;
  /** Required for project scope; null for personal signals. */
  project_id?: Id | null;
}

/** Words, not false-precision percentages (taste-learning.md §Taste interface). */
export function confidenceLabel(c: number): "tentative" | "growing" | "well-supported" {
  if (c < 0.4) return "tentative";
  if (c < 0.7) return "growing";
  return "well-supported";
}

/** confidence from supporting/contradicting evidence counts. Monotonic, bounded. */
export function confidenceFrom(supporting: number, contradicting: number): number {
  const c = (supporting - 0.5 * contradicting) / (supporting + contradicting + 2);
  return Math.max(0.05, Math.min(0.98, c));
}

export interface TasteEvidence {
  id: Id;
  signal_id: Id;
  kind: "supports" | "contradicts";
  annotation_id: Id | null;
  version_id: Id | null;
  item_id: Id | null;
}

/** One entry in a signal's lifecycle + usage history. */
export type TasteEventKind =
  | "proposed"
  | "edited"
  | "accepted"
  | "rescoped"
  | "rejected"
  | "superseded"
  | "applied";

export interface TasteEvent {
  id: Id;
  signal_id: Id;
  kind: TasteEventKind;
  actor_type: "agent" | "human" | "system";
  actor_label: string;
  /** For agent events: the session, so the acting client can be attributed. */
  agent_session_id: Id | null;
  detail: string;
  /** For kind === "applied": the artifact version the signal shaped. */
  version_id: Id | null;
  at: number;
}

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

export interface AuditEvent {
  id: Id;
  actor_type: "human" | "agent" | "system";
  actor_label: string;
  agent_session_id: Id | null;
  human_id: Id | null;
  task_id: Id | null;
  tool_name: string | null;
  operation: string;
  payload: Record<string, unknown>;
  at: number;
}

/* ------------------------------------------------------------------ *
 * Retrieval
 * ------------------------------------------------------------------ */

/**
 * Scoring factors, logged per returned item. Permission is NOT a factor here —
 * it is a hard pre-filter applied before candidate generation. An inaccessible
 * item is absent, never low-ranked.
 */
export interface RetrievalSignals {
  /** Reciprocal-rank-fused score over the lists this item appeared in. */
  fused: number;
  /** Per-list 1-based rank, or null if absent from that list. `semantic` is the
   * optional external memory index (Supermemory); null whenever it is
   * unconfigured, timed out, or returned nothing. */
  ranks: { fts: number | null; recency: number | null; graph: number | null; semantic: number | null };
  graph_strength: number;
  /** Lexical + dimension overlap with confirmed in-scope taste signals, weighted by confidence and authority order. 0 when taste is silent. */
  taste_relevance: number;
  curation: number;
  recency: number;
  authority_weight: number;
  /** fused · authority_weight · curation · (1 + taste_relevance). */
  score: number;
}

export interface RetrievedItem {
  item: ContextItem;
  region_slug: string;
  signals: RetrievalSignals;
  /** confirmed taste signal ids that materially boosted this item (→ taste_events 'applied'). */
  applied_signal_ids: Id[];
  /** Human-readable reason, surfaced in Agent Lens. */
  why: string;
}

/** Reciprocal rank fusion constant. */
export const RRF_K = 60;

/* ------------------------------------------------------------------ *
 * WebMCP tool surface
 * ------------------------------------------------------------------ */

export const TOOL_NAMES = [
  "identify_agent",
  "get_current_context_scope",
  "get_context_for_task",
  "inspect_context_item",
  "inspect_relationships",
  "get_taste_for_task",
  "trace_artifact_influences",
  "record_artifact",
  "record_feedback",
  "propose_taste_signal",
  "propose_context_change",
  "add_context_item",
  "approve_proposed_changes",
  "reject_proposed_changes",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolSpec {
  name: ToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Minimum grant level on at least one region for this tool to exist at all. */
  requires: GrantLevel;
  /** Human-readable label shown in the Chrome DevTools WebMCP panel. */
  title?: string;
  /** Chrome WebMCP hints: readOnlyHint lets the agent skip confirmation; untrustedContentHint marks output as user-generated / externally-sourced. */
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  /**
   * Plain-language reason this tool is currently registered.
   * Rendered verbatim in Agent Lens.
   */
  why: string;
}

/** Inputs to the capability compiler. Pure function, no I/O. */
export interface CapabilityInput {
  /** Regions the invoking human can actually reach. Ceiling on agent authority. */
  humanRegions: { slug: string; level: GrantLevel }[];
  /** Live, unexpired, unrevoked grants keyed by region slug. */
  grants: { slug: string; level: GrantLevel }[];
  task: { id: Id; title: string; expires_at: number | null; project_id?: Id | null } | null;
  /** The task's resolved scope, included for Agent Access/Lens consumers. */
  scope?: { project_id: Id | null; project_name: string | null };
  pageState: { hasPendingProposals: boolean; activeArtifactId: Id | null };
}

/* ------------------------------------------------------------------ *
 * Wire protocol (client → worker)
 * ------------------------------------------------------------------ */

export interface ToolCallRequest {
  tool: ToolName;
  input: Record<string, unknown>;
  agent_session_id: Id;
  task_id: Id;
}

export type ToolCallResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string; denial: true; reason: string };

/** Server-side denial reasons. Surfaced verbatim in Agent Lens. */
export const DENIAL_REASONS = {
  UNKNOWN_SESSION: "No registered agent session — call /api/session first",
  SESSION_MISMATCH: "This agent session belongs to a different person or task",
  NO_GRANT: "No grant exists for the requested region",
  REVOKED: "The grant for this region was revoked",
  EXPIRED: "The grant for this region has expired",
  TASK_CLOSED: "The task this grant was bound to is no longer open",
  EXCEEDS_HUMAN: "The invoking person does not have this access themselves",
  OUT_OF_PROJECT_SCOPE: "That item is outside this task's project scope",
  INSUFFICIENT_LEVEL: "This operation needs a higher access level than granted",
  UNKNOWN_REGION: "That region does not exist or is not visible",
  UNKNOWN_ITEM: "That item does not exist or is not visible in this task",
  UNKNOWN_TOOL: "That tool is not available for this task",
  INVALID_PARENT: "parent_version_id must be an existing version of the same artifact",
} as const;

/* ------------------------------------------------------------------ *
 * API routes
 * ------------------------------------------------------------------ */

export const API = {
  health: "/api/health",
  bootstrap: "/api/bootstrap",
  regions: "/api/regions",
  projects: "/api/projects",
  projectMembers: "/api/project-members",
  items: "/api/items",
  upload: "/api/upload",
  /** GET ?key=… — streams a canonical original back out of R2. */
  blob: "/api/blob",
  /** GET ?version_id=… — the three provenance record types for one version. */
  provenance: "/api/provenance",
  graph: "/api/graph",
  task: "/api/task",
  /** Registers an agent session bound to the authenticated human + task. */
  session: "/api/session",
  grants: "/api/grants",
  capabilities: "/api/capabilities",
  toolCall: "/api/mcp/call",
  artifacts: "/api/artifacts",
  annotations: "/api/annotations",
  decisions: "/api/decisions",
  taste: "/api/taste",
  /** GET ?signal_id=… — the evidence cited by one taste signal. */
  tasteEvidence: "/api/taste/evidence",
  lens: "/api/lens",
  /** GET — assembled agent-usage stats for the whole space. */
  stats: "/api/stats",
  /** GET — this member's beta slot and monthly quota usage. */
  quota: "/api/quota",
  /** Links between items. GET ?item_id=… · POST create · PATCH review · DELETE ?id=… */
  edges: "/api/edges",
  /** Notes on one item. GET ?item_id=… · POST create · DELETE ?id=… */
  itemNotes: "/api/items/notes",
  /** External memory index sync. GET — status · POST — force a full re-sync. */
  memoryStatus: "/api/memory/status",
} as const;
