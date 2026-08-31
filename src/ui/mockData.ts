/**
 * Single source of mock data for every route/component, contract-shaped.
 * Swap this module for real fetches later — components take view models as
 * props and never import this file directly except at the route level.
 */
import type {
  AccessRecord,
  Annotation,
  Artifact,
  ArtifactVersion,
  ContextItem,
  DecisionRecord,
  DenialRecord,
  Grant,
  InfluenceRecord,
  Region,
  Space,
  Task,
  TasteEvidence,
  TasteSignal,
} from "@shared/contract";
import type {
  AgentAccessViewModel,
  AgentLensViewModel,
  ArchiveViewModel,
  TasteViewModel,
  WorkbenchViewModel,
} from "./viewmodels";

const now = Date.now();
const hour = 3_600_000;

export const mockSpace: Space = {
  id: "space_1",
  name: "Sriram's Desk",
  owner_id: "human_1",
  kind: "personal",
  created_at: now - 90 * 24 * hour,
};

export const mockRegions: Region[] = [
  { id: "region_work", space_id: mockSpace.id, parent_id: null, name: "Work", slug: "work", created_at: now - 80 * 24 * hour },
  { id: "region_inspiration", space_id: mockSpace.id, parent_id: null, name: "Inspiration", slug: "inspiration", created_at: now - 80 * 24 * hour },
  { id: "region_personal", space_id: mockSpace.id, parent_id: null, name: "Personal", slug: "personal", created_at: now - 80 * 24 * hour },
];

const items: ContextItem[] = [
  {
    id: "item_brief",
    space_id: mockSpace.id,
    region_id: "region_work",
    owner_id: "human_1",
    type: "document",
    title: "Q3 brand refresh brief",
    source_url: null,
    content_ref: "r2/brief.pdf",
    semantic_text: "Brand refresh scope, tone, deliverables.",
    metadata: {},
    authority_class: "human_authored",
    created_by: "human_1",
    created_at: now - 6 * 24 * hour,
    updated_at: now - 2 * 24 * hour,
  },
  {
    id: "item_hero",
    space_id: mockSpace.id,
    region_id: "region_work",
    owner_id: "human_1",
    type: "image",
    title: "Hero photography, warehouse shoot",
    source_url: null,
    content_ref: "r2/hero.jpg",
    semantic_text: null,
    metadata: { width: 2400, height: 1600 },
    authority_class: "human_authored",
    created_by: "human_1",
    created_at: now - 5 * 24 * hour,
    updated_at: now - 5 * 24 * hour,
  },
  {
    id: "item_ref1",
    space_id: mockSpace.id,
    region_id: "region_inspiration",
    owner_id: "human_1",
    type: "link",
    title: "Editorial type pairing — Spectral/Inter",
    source_url: "https://example.com/type-pairing",
    content_ref: null,
    semantic_text: "Serif/sans contrast reference for archive UI.",
    metadata: {},
    authority_class: "imported_source_linked",
    created_by: "human_1",
    created_at: now - 20 * 24 * hour,
    updated_at: now - 20 * 24 * hour,
  },
  {
    id: "item_ref2",
    space_id: mockSpace.id,
    region_id: "region_inspiration",
    owner_id: "human_1",
    type: "screenshot",
    title: "Gallery-scale layout, warm palette",
    source_url: null,
    content_ref: "r2/ref2.png",
    semantic_text: null,
    metadata: { width: 1800, height: 2200 },
    authority_class: "imported_source_linked",
    created_by: "human_1",
    created_at: now - 18 * 24 * hour,
    updated_at: now - 18 * 24 * hour,
  },
  {
    id: "item_note",
    space_id: mockSpace.id,
    region_id: "region_personal",
    owner_id: "human_1",
    type: "note",
    title: "Reflections on slower mornings",
    source_url: null,
    content_ref: null,
    semantic_text: "Personal journal entry, not for agent access.",
    metadata: {},
    authority_class: "human_authored",
    created_by: "human_1",
    created_at: now - 3 * 24 * hour,
    updated_at: now - 3 * 24 * hour,
  },
];

export const mockItems = items;

export function itemsForRegion(regionId: string): ContextItem[] {
  return items.filter((i) => i.region_id === regionId);
}

export const mockTask: Task = {
  id: "task_1",
  space_id: mockSpace.id,
  human_id: "human_1",
  title: "Draft hero layout for Q3 brief",
  instruction: "Use the brief and inspiration references to propose a hero layout.",
  status: "open",
  created_at: now - 2 * hour,
  expires_at: now + 22 * hour,
};

const grants: Grant[] = [
  {
    id: "grant_work",
    task_id: mockTask.id,
    space_id: mockSpace.id,
    region_id: "region_work",
    level: "read",
    grantor_id: "human_1",
    created_at: now - 2 * hour,
    expires_at: now + 22 * hour,
    revoked_at: null,
    revoked_by: null,
    reason: null,
  },
  {
    id: "grant_inspiration",
    task_id: mockTask.id,
    space_id: mockSpace.id,
    region_id: "region_inspiration",
    level: "propose",
    grantor_id: "human_1",
    created_at: now - 2 * hour,
    expires_at: now + 22 * hour,
    revoked_at: null,
    revoked_by: null,
    reason: null,
  },
];

export const mockAgentAccess: AgentAccessViewModel = {
  task: mockTask,
  rows: [
    { regionId: "region_work", label: "Work", level: "read" },
    { regionId: "region_inspiration", label: "Inspiration", level: "propose" },
    { regionId: "region_personal", label: "Personal", level: "none" },
  ],
  scopeNote: "For this task · expires when the task ends",
};

export function mockArchive(): ArchiveViewModel {
  return {
    space: mockSpace,
    regions: mockRegions.map((region) => ({ region, items: itemsForRegion(region.id) })),
  };
}

const artifact: Artifact = {
  id: "artifact_1",
  space_id: mockSpace.id,
  task_id: mockTask.id,
  kind: "visual_brief",
  title: "Q3 hero layout",
  created_at: now - 90 * 60_000,
};

const versionV1: ArtifactVersion = {
  id: "version_1",
  artifact_id: artifact.id,
  version_no: 1,
  parent_version_id: null,
  content_html: "<section><h1>Hero layout draft</h1><p>Warehouse photography, editorial type.</p></section>",
  agent_session_id: "agent_session_1",
  state: "changes_requested",
  created_at: now - 80 * 60_000,
};

const versionV2: ArtifactVersion = {
  id: "version_2",
  artifact_id: artifact.id,
  version_no: 2,
  parent_version_id: versionV1.id,
  content_html: "<section><h1>Hero layout, revised</h1><p>Larger hero crop, tightened headline scale.</p></section>",
  agent_session_id: "agent_session_1",
  state: "in_review",
  created_at: now - 15 * 60_000,
};

const influences: InfluenceRecord[] = [
  { id: "inf_1", version_id: versionV2.id, item_id: "item_hero", role: "hero image", strength: 0.9, note: null },
  { id: "inf_2", version_id: versionV2.id, item_id: "item_ref1", role: "type pairing", strength: 0.6, note: "Serif/sans contrast" },
];

const accesses: AccessRecord[] = [
  { id: "acc_1", task_id: mockTask.id, item_id: "item_brief", tool_name: "get_context_for_task", at: now - 78 * 60_000 },
  { id: "acc_2", task_id: mockTask.id, item_id: "item_ref2", tool_name: "get_context_for_task", at: now - 70 * 60_000 },
];

const denials: DenialRecord[] = [
  {
    id: "den_1",
    task_id: mockTask.id,
    agent_session_id: "agent_session_1",
    tool_name: "get_context_for_task",
    requested: { region: "personal" },
    reason: "No grant exists for the requested region",
    at: now - 60 * 60_000,
  },
];

const annotations: Annotation[] = [
  {
    id: "ann_1",
    version_id: versionV2.id,
    author_id: "human_1",
    target: { kind: "region", x: 0.1, y: 0.2, w: 0.3, h: 0.15 },
    sentiment: "negative",
    dimension: "typography",
    comment: "Headline feels too small against the hero crop.",
    status: "open",
    created_at: now - 12 * 60_000,
  },
  {
    id: "ann_2",
    version_id: versionV2.id,
    author_id: "human_1",
    target: null,
    sentiment: "positive",
    dimension: "imagery",
    comment: "Warehouse shot choice is right.",
    status: "resolved",
    created_at: now - 40 * 60_000,
  },
];

const decisions: DecisionRecord[] = [
  {
    id: "dec_1",
    version_id: versionV1.id,
    actor_id: "human_1",
    decision: "request_changes",
    note: "Scale up the headline, keep the crop.",
    prev_state: "ready_for_review",
    at: now - 30 * 60_000,
  },
];

function itemById(id: string): ContextItem | null {
  return items.find((i) => i.id === id) ?? null;
}

export function mockWorkbench(): WorkbenchViewModel {
  return {
    artifact,
    version: versionV2,
    versions: [versionV1, versionV2],
    provenance: {
      influences: influences.map((inf) => ({ ...inf, item: itemById(inf.item_id) })),
      accesses: accesses.map((acc) => ({ ...acc, item: itemById(acc.item_id) })),
      denials,
    },
    annotations,
    decisions,
    state: versionV2.state,
  };
}

export function mockAgentLens(): AgentLensViewModel {
  return {
    declaredIdentity: "ChatGPT desktop (declared, unverified)",
    taskTitle: mockTask.title,
    expiresAt: mockTask.expires_at,
    registeredTools: [
      { name: "get_context_for_task", why: "Task has a read grant on Work and Inspiration." },
      { name: "propose_context_change", why: "Task has a propose grant on Inspiration." },
    ],
    recentRetrievals: [
      { itemTitle: "Q3 brand refresh brief", why: "Matched task instruction, high authority", at: now - 78 * 60_000 },
      { itemTitle: "Gallery-scale layout, warm palette", why: "Related by inspired_by edge", at: now - 70 * 60_000 },
    ],
    denials,
  };
}

const tasteSignals: TasteSignal[] = [
  {
    id: "taste_1",
    space_id: mockSpace.id,
    owner_id: "human_1",
    statement: "Prefers hero images cropped tight to a single subject over collages.",
    dimensions: ["imagery", "composition"],
    scope: "project",
    status: "proposed",
    confidence: 0.72,
    created_by: "system",
    approved_by: null,
    created_at: now - 25 * 60_000,
  },
  {
    id: "taste_2",
    space_id: mockSpace.id,
    owner_id: "human_1",
    statement: "Headlines should read larger than the reference examples suggest.",
    dimensions: ["typography", "visual_hierarchy"],
    scope: "project",
    status: "confirmed",
    confidence: 0.88,
    created_by: "human",
    approved_by: "human_1",
    created_at: now - 5 * 24 * hour,
  },
];

const tasteEvidence: (TasteEvidence & { label: string })[] = [
  { id: "ev_1", signal_id: "taste_1", kind: "supports", annotation_id: "ann_2", version_id: versionV2.id, item_id: null, label: "Annotation: “Warehouse shot choice is right.”" },
  { id: "ev_2", signal_id: "taste_1", kind: "contradicts", annotation_id: null, version_id: versionV1.id, item_id: "item_ref2", label: "Reference: Gallery-scale layout used a collage" },
];

export function mockTaste(): TasteViewModel {
  return {
    pending: tasteSignals
      .filter((s) => s.status === "proposed")
      .map((signal) => ({ signal, evidence: tasteEvidence.filter((e) => e.signal_id === signal.id) })),
    confirmed: tasteSignals.filter((s) => s.status === "confirmed"),
  };
}

export const mockGrants = grants;
