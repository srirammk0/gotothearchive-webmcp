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

/* ------------------------------------------------------------------ *
 * Design profile — structured visual facts extracted from an image
 * ------------------------------------------------------------------ */

/**
 * What an archived image actually LOOKS like, as structured data rather than a
 * prose caption. Stored on `ContextItem.metadata.design`.
 *
 * Two very different provenances, deliberately kept in one object:
 *   `palette`  — measured. Exact hex + coverage, quantized from the real pixels
 *                in the browser at capture time. Not a model's guess.
 *   everything else — judged. A vision model choosing from the closed
 *                vocabularies below, so the values are comparable across items
 *                (graph edges, taste matching) instead of free prose.
 *
 * Every vocabulary is a closed enum on purpose: an open string would give a
 * different word for the same thing on every call, and nothing downstream could
 * match on it.
 */

export const TYPE_CLASSIFICATIONS = [
  "didone_serif",
  "transitional_serif",
  "slab_serif",
  "grotesque",
  "neo_grotesque",
  "geometric_sans",
  "humanist_sans",
  "monospace",
  "script",
  "display_decorative",
  "blackletter",
  "none",
] as const;
export type TypeClassification = (typeof TYPE_CLASSIFICATIONS)[number];

export const TYPE_CASES = ["uppercase", "lowercase", "title_case", "mixed", "none"] as const;
export type TypeCase = (typeof TYPE_CASES)[number];

/** Display type size relative to the frame, not in points. */
export const TYPE_SCALES = ["hero", "large", "moderate", "small", "none"] as const;
export type TypeScale = (typeof TYPE_SCALES)[number];

export const COMPOSITIONS = [
  "poster_split",
  "centered",
  "full_bleed_image",
  "grid_contact_sheet",
  "editorial_column",
  "asymmetric_stack",
  "type_only",
  "diagram",
  "product_shot",
] as const;
export type Composition = (typeof COMPOSITIONS)[number];

export const LAYOUT_DENSITIES = ["sparse", "balanced", "dense"] as const;
export type LayoutDensity = (typeof LAYOUT_DENSITIES)[number];

export const TEXTURES = [
  "halftone",
  "paper_grain",
  "riso_misregistration",
  "photocopy",
  "noise_grain",
  "gradient_mesh",
  "flat_clean",
  "glossy",
] as const;
export type Texture = (typeof TEXTURES)[number];

export const CORNER_RADII = ["sharp", "slight", "rounded", "pill", "organic"] as const;
export type CornerRadius = (typeof CORNER_RADII)[number];

export const STROKE_WEIGHTS = ["none", "hairline", "medium", "heavy"] as const;
export type StrokeWeight = (typeof STROKE_WEIGHTS)[number];

export const IMAGE_TREATMENTS = [
  "duotone",
  "halftone",
  "full_color_photo",
  "black_and_white_photo",
  "illustration",
  "line_drawing",
  "3d_render",
  "collage",
  "none",
] as const;
export type ImageTreatment = (typeof IMAGE_TREATMENTS)[number];

export const MOODS = [
  "editorial",
  "retro_print",
  "minimal",
  "brutalist",
  "luxury",
  "playful",
  "technical",
  "organic",
  "streetwear",
  "corporate",
  "experimental",
] as const;
export type Mood = (typeof MOODS)[number];

export const PALETTE_ROLES = ["ground", "primary", "secondary", "accent", "text"] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

/** One measured colour: exact hex, its share of the frame, and what it does. */
export interface PaletteEntry {
  /** Uppercase #RRGGBB. Measured from pixels, never invented. */
  hex: string;
  /** Percent of sampled pixels, 0-100. The list is sorted by this, descending. */
  pct: number;
  /** Assigned by coverage + position: the biggest area is the ground, and so on. */
  role: PaletteRole;
}

export interface DesignProfile {
  palette: PaletteEntry[];
  /**
   * Where `palette` came from, and it matters: "measured" is quantized from the
   * real pixels in the browser at capture time and is exact; "estimated" is the
   * vision model naming colours it thinks it sees, used only when we never had
   * the bytes in a browser (backfill of already-archived items). Never present
   * an estimated palette as measured — the UI and the agent both get told which.
   */
  palette_source: "measured" | "estimated" | "none";
  typography: {
    classification: TypeClassification;
    case: TypeCase;
    scale: TypeScale;
    /** One short human phrase, e.g. "high-contrast condensed caps". */
    note: string;
  };
  layout: {
    composition: Composition;
    density: LayoutDensity;
    alignment: "left" | "center" | "right" | "justified" | "none";
  };
  texture: Texture[];
  shape: { corner_radius: CornerRadius; stroke: StrokeWeight };
  imagery: { treatment: ImageTreatment };
  mood: Mood[];
  /** Which model judged the non-palette fields. Never presented as human-authored. */
  extracted_by: string;
  extracted_at: number;
}

/**
 * The design vocabulary that maps onto each taste dimension. Used to turn a
 * confirmed taste signal into a real attribute match instead of word overlap.
 */
export const DIMENSION_DESIGN_FIELDS: Record<TasteDimension, readonly string[]> = {
  typography: ["typography.classification", "typography.case", "typography.scale"],
  composition: ["layout.composition", "layout.alignment"],
  layout_density: ["layout.density"],
  color: ["palette"],
  imagery: ["imagery.treatment", "texture"],
  motion: [],
  visual_hierarchy: ["typography.scale", "layout.composition"],
  tone_voice: ["mood"],
  structure_clarity: ["layout.density", "layout.composition"],
};

/** Flattened comparable tokens for one profile — the unit of graph + taste matching. */
export function designTokens(d: DesignProfile | null | undefined): string[] {
  if (!d) return [];
  const t: string[] = [];
  if (d.typography.classification !== "none") t.push(`type:${d.typography.classification}`);
  if (d.typography.case !== "none") t.push(`case:${d.typography.case}`);
  if (d.typography.scale !== "none") t.push(`scale:${d.typography.scale}`);
  t.push(`composition:${d.layout.composition}`, `density:${d.layout.density}`);
  if (d.layout.alignment !== "none") t.push(`align:${d.layout.alignment}`);
  for (const x of d.texture) t.push(`texture:${x}`);
  t.push(`radius:${d.shape.corner_radius}`, `stroke:${d.shape.stroke}`);
  if (d.imagery.treatment !== "none") t.push(`imagery:${d.imagery.treatment}`);
  for (const m of d.mood) t.push(`mood:${m}`);
  for (const p of d.palette) t.push(`hue:${hueBucket(p.hex)}`);
  return [...new Set(t)];
}

/**
 * Coarse hue name for a hex. Two items "share a colour" when they land in the
 * same bucket — exact hex equality almost never happens across real images, so
 * matching on it would find nothing.
 */
export function hueBucket(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "unknown";
  const n = Number.parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.08) return l > 0.85 ? "white" : l < 0.15 ? "black" : "grey";
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 200) return "cyan";
  if (h < 260) return "blue";
  if (h < 290) return "violet";
  return "magenta";
}

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

/**
 * The shape an artifact is meant to be viewed at.
 *
 * The Workbench cannot measure a sandboxed artifact's natural height (no
 * scripts in a `sandbox=""` iframe, and the review overlay positions its region
 * marks as a percentage of the iframe's own box, so letting the content scroll
 * inside would drift the marks off what they point at). So the artifact
 * declares its shape and the viewer gives it exactly that box — nothing is
 * clipped and the marks stay aligned. A 3:4 poster was previously cut off at a
 * fixed 560px.
 */
export const ARTIFACT_ASPECTS = ["poster", "portrait", "square", "wide", "page", "auto"] as const;
export type ArtifactAspect = (typeof ARTIFACT_ASPECTS)[number];

/** CSS `aspect-ratio` per shape. "auto" keeps the old fixed-height behaviour. */
export const ASPECT_RATIO: Record<ArtifactAspect, string | null> = {
  poster: "3 / 4",
  portrait: "2 / 3",
  square: "1 / 1",
  wide: "16 / 9",
  page: "1 / 1.414",
  auto: null,
};

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
  /** "agent" = named by an agent via propose_taste_signal; "system" = derived from annotations. */
  created_by: "system" | "human" | "agent";
  approved_by: Id | null;
  created_at: number;
  /** Bitemporal: id of the signal this one replaces, or null. */
  supersedes: Id | null;
  /** Required for project scope; null for personal signals. */
  project_id?: Id | null;
}

/** Words, not false-precision percentages. */
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
  "get_taste_for_task",
  "trace_artifact_influences",
  "record_artifact",
  "propose_taste_signal",
  "add_context_item",
  "withdraw_artifact",
  "remove_context_item",
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
  /** A malformed call, not a permission problem — these two used to return
   *  EXCEEDS_HUMAN, which told Agent Lens the person lacked access when the real
   *  fault was a missing or unusable argument. */
  MISSING_INPUT: "A required argument was missing or empty",
  UNKNOWN_ARTIFACT: "That artifact does not exist in this task",
  NOT_AGENT_AUTHORED:
    "Only an item an agent filed here can be removed this way. Anything the person wrote or captured is theirs to delete.",
  NOT_YOURS_TO_WITHDRAW: "That artifact was not produced by this task, so it cannot be withdrawn here",
  ALREADY_REVIEWED:
    "A person has already annotated or decided on this artifact — withdrawing it would destroy their feedback. They can delete it themselves.",
  NO_USABLE_EVIDENCE:
    "None of the cited annotations or items are reachable in this task, so there is nothing to ground this on",
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
} as const;
