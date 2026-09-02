/**
 * Typed client for the worker API.
 *
 * This is the single seam between the UI and the server. Every UI surface goes
 * through it — no component should call `fetch` directly, so that auth, error
 * shape, and credential handling stay in one place.
 */
import { getToken } from "@clerk/react";
import {
  API,
  type Annotation,
  type Artifact,
  type ArtifactVersion,
  type CapabilityInput,
  type ContextEdge,
  type ContextItem,
  type ItemNote,
  type DenialRecord,
  type GrantLevel,
  type Grant,
  type InfluenceRecord,
  type ItemType,
  type Region,
  type ReviewDecision,
  type Space,
  type TasteDimension,
  type TasteEvent,
  type TasteSignal,
  type Task,
} from "@shared/contract";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A caught value's message, or `fallback` when it isn't an Error (a thrown string, a rejected non-Error). */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * The signed-in visitor's Clerk session token. Read globally rather than
 * threaded through hooks, so every call site carries identity without knowing
 * about Clerk. The UI only renders signed in, so a missing token here is an
 * expired session — the request 401s and Clerk moves the visitor to sign-in.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const token = await getToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * A short-lived, in-memory GET cache — no persistence, no new dependency,
 * just reuse within the same tab. Every read goes through `req()`, so this
 * covers every list/get call site uniformly instead of each hook growing its
 * own cache. A GET within CACHE_TTL_MS of the last one for that exact URL
 * (including query string, so distinct filters/ids never collide) returns
 * instantly with no network round trip; a concurrent identical GET reuses
 * the same in-flight promise instead of firing twice.
 *
 * Any non-GET request clears the whole cache on success — simpler and
 * safer than per-endpoint invalidation given how cross-referenced this data
 * is (an item write can move counts on regions, stats, and taste evidence).
 * TTL is short enough that both existing polls (MemorySync ~15s, Stats
 * ~30s + focus/visibility refresh) still hit the network on every tick.
 */
const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Test-only: resets the module-level request cache between tests. */
export function clearRequestCacheForTests(): void {
  cache.clear();
  inflight.clear();
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const isGet = !init?.method || init.method === "GET";
  if (isGet) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T;
    const pending = inflight.get(path);
    if (pending) return pending as Promise<T>;
  }

  const run = async (): Promise<T> => {
    const res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(await authHeader()),
        ...init?.headers,
      },
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new ApiError(`Unexpected response from ${path}`, res.status);
    }
    const body = data as { ok?: boolean; error?: string; message?: string };
    if (!res.ok || body.ok === false) {
      throw new ApiError(body.message ?? body.error ?? `Request to ${path} failed`, res.status);
    }
    if (isGet) cache.set(path, { at: Date.now(), data });
    else cache.clear();
    return data as T;
  };

  if (!isGet) return run();
  const promise = run().finally(() => inflight.delete(path));
  inflight.set(path, promise);
  return promise;
}

const qs = (params: Record<string, string | null | undefined>): string => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const s = search.toString();
  return s ? `?${s}` : "";
};

/* ---------------- space ---------------- */

export const bootstrap = () =>
  req<{ space: Space; regions: Region[] }>(API.bootstrap, { method: "POST" });

export const listRegions = () => req<{ regions: Region[] }>(API.regions);

export const createRegion = (name: string, parentId: string | null = null) =>
  req<{ region: Region }>(API.regions, { method: "POST", body: JSON.stringify({ name, parent_id: parentId }) });

export const renameRegion = (id: string, name: string) =>
  req<{ region: Region }>(API.regions, { method: "PATCH", body: JSON.stringify({ id, name }) });

export const deleteRegion = (id: string) =>
  req<{ deleted: string }>(`${API.regions}${qs({ id })}`, { method: "DELETE" });

/* ---------------- items ---------------- */

export const listItems = (regionSlug?: string) =>
  req<{ items: ContextItem[] }>(`${API.items}${qs({ region: regionSlug })}`);

export const createItem = (input: {
  region_slug: string;
  type: ItemType;
  title: string;
  source_url?: string | null;
  content_ref?: string | null;
  semantic_text?: string | null;
}) => req<{ item: ContextItem }>(API.items, { method: "POST", body: JSON.stringify(input) });

/* ---------------- item links + notes ---------------- */

export interface ItemLink extends ContextEdge {
  direction: "in" | "out";
  other: ContextItem | null;
  proposed_by_agent: boolean;
}

export const listItemLinks = (itemId: string) =>
  req<{ links: ItemLink[] }>(`${API.edges}${qs({ item_id: itemId })}`);

export const createItemLink = (fromItemId: string, toItemId: string, relationship?: string) =>
  req<{ edge: ContextEdge }>(API.edges, {
    method: "POST",
    body: JSON.stringify({ from_item_id: fromItemId, to_item_id: toItemId, relationship }),
  });

export const reviewItemLink = (id: string, approval_state: "approved" | "rejected") =>
  req<{ edge: ContextEdge }>(API.edges, { method: "PATCH", body: JSON.stringify({ id, approval_state }) });

export const deleteItemLink = (id: string) =>
  req<{ deleted: string }>(`${API.edges}${qs({ id })}`, { method: "DELETE" });

export const listItemNotes = (itemId: string) =>
  req<{ notes: ItemNote[] }>(`${API.itemNotes}${qs({ item_id: itemId })}`);

export const addItemNote = (itemId: string, body: string) =>
  req<{ note: ItemNote }>(API.itemNotes, { method: "POST", body: JSON.stringify({ item_id: itemId, body }) });

export const deleteItemNote = (id: string) =>
  req<{ deleted: string }>(`${API.itemNotes}${qs({ id })}`, { method: "DELETE" });

/* ---------------- memory sync ---------------- */

export interface MemorySyncStatus {
  mirror_enabled: boolean;
  items: number;
  synced: number;
  pending: number;
  failed: number;
  recent_errors: string[];
}

export const getMemoryStatus = () =>
  req<{ status: MemorySyncStatus; key_at_request: boolean }>(API.memoryStatus);

/** Move one or more items to another folder, and/or rename a single item. */
export const updateItems = (
  ids: string[],
  changes: { region_slug?: string; title?: string; semantic_text?: string; pinned?: boolean },
) => req<{ items: ContextItem[] }>(API.items, { method: "PATCH", body: JSON.stringify({ ids, ...changes }) });

export const deleteItems = (ids: string[]) =>
  req<{ deleted: string[] }>(API.items, { method: "DELETE", body: JSON.stringify({ ids }) });

/** Uploads raw bytes to R2 and returns the key to store as an item's content_ref. */
export async function uploadBlob(file: File): Promise<string> {
  const res = await fetch(API.upload, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": file.type || "application/octet-stream", ...(await authHeader()) },
    body: file,
  });
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; key?: string; error?: string; message?: string }
    | null;
  if (!res.ok || !body?.key) {
    // Surface the real reason — quota reached, file too large, rate limited —
    // not a generic "Upload failed".
    throw new ApiError(body?.message ?? body?.error ?? "Upload failed", res.status);
  }
  return body.key;
}

/** The URL to render a stored original. Never a raw R2 URL. */
export const blobUrl = (key: string) => `${API.blob}${qs({ key })}`;

/* ---------------- tasks, sessions, grants ---------------- */

export const createTask = (title: string, instruction = "") =>
  req<{ task: Task }>(API.task, { method: "POST", body: JSON.stringify({ title, instruction }) });

export const listTasks = () => req<{ tasks: Task[] }>(API.task);

/**
 * Sets a region's level for a task. Supersedes whatever was there before;
 * "none" revokes. This is what the folder lock control calls.
 */
export const setGrant = (taskId: string, regionSlug: string, level: GrantLevel) =>
  req<{ grant?: Grant; revoked?: boolean }>(API.grants, {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, region_slug: regionSlug, level }),
  });

export const getCapabilities = (taskId: string) =>
  req<{ capabilities: CapabilityInput }>(`${API.capabilities}${qs({ task_id: taskId })}`);

/* ---------------- artifacts and review ---------------- */

export interface WorkbenchArtifact extends Artifact {
  version_count: number;
  state: ArtifactVersion["state"];
  updated_at: number;
  preview_html: string;
  influence_count: number;
  /** Slugs of the archive folders whose material shaped the latest version. */
  regions: string[];
}

export const listArtifacts = () => req<{ artifacts: WorkbenchArtifact[] }>(API.artifacts);

export const getArtifact = (id: string) =>
  req<{ artifact: Artifact; versions: ArtifactVersion[] }>(`${API.artifacts}${qs({ id })}`);

export const deleteArtifact = (id: string) =>
  req<{ deleted: string }>(`${API.artifacts}${qs({ id })}`, { method: "DELETE" });

export interface Provenance {
  influences: (InfluenceRecord & { item: ContextItem | null })[];
  accesses: { id: string; item_id: string; tool_name: string; at: number; item: ContextItem | null }[];
  denials: DenialRecord[];
}

/** The three provenance record types, kept separate by contract. */
export const getProvenance = (versionId: string) =>
  req<{ provenance: Provenance }>(`${API.provenance}${qs({ version_id: versionId })}`);

export const listAnnotations = (versionId: string) =>
  req<{ annotations: Annotation[] }>(`${API.annotations}${qs({ version_id: versionId })}`);

export const createAnnotation = (input: {
  version_id: string;
  sentiment: Annotation["sentiment"];
  comment: string;
  dimensions?: TasteDimension[];
  target?: Annotation["target"];
}) =>
  req<{ annotation: Annotation }>(API.annotations, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateAnnotation = (
  id: string,
  changes: { comment?: string; sentiment?: Annotation["sentiment"]; dimensions?: TasteDimension[] },
) =>
  req<{ annotation: Annotation }>(API.annotations, {
    method: "PATCH",
    body: JSON.stringify({ id, ...changes }),
  });

export const recordDecision = (versionId: string, decision: ReviewDecision, note?: string) =>
  req<{ version: ArtifactVersion }>(API.decisions, {
    method: "POST",
    body: JSON.stringify({ version_id: versionId, decision, note: note ?? null }),
  });

/* ---------------- taste ---------------- */

export type TasteFeedEvent = TasteEvent & {
  statement: string;
  artifact: { title: string; preview_html: string } | null;
  item: ContextItem | null;
};

export const listTasteSignals = () =>
  req<{ signals: TasteSignal[]; recent_events: TasteFeedEvent[] }>(API.taste);

/**
 * Accept, edit, rescope, or reject a signal. Every field is optional except the
 * id, so an edit does not require restating the status and a rescope does not
 * imply acceptance — nothing is ever confirmed as a side effect.
 */
export const updateTasteSignal = (
  id: string,
  changes: { status?: TasteSignal["status"]; statement?: string; scope?: TasteSignal["scope"] },
) =>
  req<{ signal: TasteSignal }>(API.taste, {
    method: "PATCH",
    body: JSON.stringify({ id, ...changes }),
  });

export interface EvidenceRecord {
  id: string;
  signal_id: string;
  kind: "supports" | "contradicts";
  annotation: Annotation | null;
  item: ContextItem | null;
}

export interface TasteHistoryEvent extends TasteEvent {
  artifact: { id: string; title: string; version_no: number } | null;
}

/** The feedback/artifacts a signal cites, plus its full lifecycle + usage history. */
export const getTasteEvidence = (signalId: string) =>
  req<{ evidence: EvidenceRecord[]; events: TasteHistoryEvent[] }>(
    `${API.tasteEvidence}${qs({ signal_id: signalId })}`,
  );

/* ---------------- stats ---------------- */

export interface SpaceStats {
  totals: { items: number; artifacts: number; actions: number };
  activity_by_day: Record<string, number>;
  tools: { label: string; value: number }[];
  agents: { label: string; provider: string; actions: number; artifacts: number; taste: number }[];
  folders: { label: string; value: number }[];
  sources: { label: string; value: number }[];
  outcomes: { label: string; value: number }[];
  latest: { id: string; title: string; preview_html: string; updated_at: number }[];
  taste: {
    total: number;
    confirmed: number;
    proposed: number;
    applications: number;
    applied_by_day: Record<string, number>;
    dimensions: { label: string; value: number }[];
    top_applied: { label: string; value: number }[];
  };
}

export const getStats = () => req<{ stats: SpaceStats }>(API.stats);

/* ---------------- beta quota ---------------- */

export interface QuotaInfo {
  period: string;
  resets_at: number;
  beta: { slot: number | null; taken: number; max: number };
  metrics: { metric: string; used: number; limit: number }[];
}

export const getQuota = () => req<{ quota: QuotaInfo }>(API.quota);

/* ---------------- agent lens ---------------- */

export const getLens = (taskId: string) =>
  req<{
    lens: {
      accesses: { id: string; item_id: string; tool_name: string; at: number }[];
      denials: DenialRecord[];
      audit: { id: string; tool_name: string | null; operation: string; at: number }[];
    };
  }>(`${API.lens}${qs({ task_id: taskId })}`);
