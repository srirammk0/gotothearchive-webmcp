/**
 * View-model types for src/ui + src/routes. Every shape here is derived from
 * @shared/contract entities — no invented entity shapes. These exist so
 * components can stay pure functions of props, fed by the API client.
 */
import type {
  AccessRecord,
  Annotation,
  Artifact,
  ArtifactState,
  ArtifactVersion,
  ContextItem,
  DecisionRecord,
  DenialRecord,
  Grant,
  GrantLevel,
  InfluenceRecord,
  Region,
  Space,
  Task,
  TasteEvidence,
  TasteSignal,
} from "@shared/contract";

/** A region plus the agent's live effective grant on it, for Agent Access UI. */
export interface RegionGrantView {
  region: Region;
  level: GrantLevel;
  grant: Grant | null;
}

/** One row in the plain-language Agent Access summary. */
export interface AgentAccessSummaryRow {
  regionId: string;
  label: string;
  level: GrantLevel;
}

export interface AgentAccessViewModel {
  task: Task | null;
  rows: AgentAccessSummaryRow[];
  scopeNote: string;
}

/** Archive: a region rendered as an editorial index of its items. */
export interface ArchiveRegionView {
  region: Region;
  items: ContextItem[];
}

export interface ArchiveViewModel {
  space: Space;
  regions: ArchiveRegionView[];
}

/**
 * Retrieval surfacing (retrieval-architecture.md §5). The worker may attach a
 * why() line and the taste signals it applied to each retrieved/accessed row
 * once retrieval Tracks A/B land. Until then both are absent and the UI omits
 * them — always treat these as optional.
 */
export interface RetrievalProvenanceFields {
  why?: string | null;
  applied_signal_ids?: string[] | null;
}

/** Workbench: an artifact version plus everything needed to review it. */
export interface ProvenanceGroups {
  influences: (InfluenceRecord & { item: ContextItem | null } & RetrievalProvenanceFields)[];
  accesses: (AccessRecord & { item: ContextItem | null } & RetrievalProvenanceFields)[];
  denials: DenialRecord[];
}

export interface WorkbenchViewModel {
  artifact: Artifact;
  version: ArtifactVersion;
  versions: ArtifactVersion[];
  provenance: ProvenanceGroups;
  annotations: Annotation[];
  decisions: DecisionRecord[];
  state: ArtifactState;
}

/** Agent Lens shell — props only, no fetching inside the component. */
export interface AgentLensViewModel {
  declaredIdentity: string | null;
  taskTitle: string | null;
  expiresAt: number | null;
  registeredTools: { name: string; why: string }[];
  recentRetrievals: { itemTitle: string; why: string; at: number }[];
  denials: DenialRecord[];
}

/** Taste: a proposal with its evidence one Disclosure away. */
export interface TasteProposalView {
  signal: TasteSignal;
  evidence: (TasteEvidence & { label: string })[];
}

export interface TasteViewModel {
  pending: TasteProposalView[];
  confirmed: TasteSignal[];
}
