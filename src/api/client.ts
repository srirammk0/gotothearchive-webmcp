/**
 * Typed client for the worker API.
 *
 * This is the single seam between the UI and the server. Every UI surface goes
 * through it — no component should call `fetch` directly, so that auth, error
 * shape, and credential handling stay in one place.
 */
import {
  API,
  type Annotation,
  type Artifact,
  type ArtifactVersion,
  type CapabilityInput,
  type ContextItem,
  type DenialRecord,
  type GrantLevel,
  type Grant,
  type InfluenceRecord,
  type ItemType,
  type Region,
  type ReviewDecision,
  type Space,
  type TasteDimension,
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
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
  const body = data as { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) {
    throw new ApiError(body.error ?? `Request to ${path} failed`, res.status);
  }
  return data as T;
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

/** Uploads raw bytes to R2 and returns the key to store as an item's content_ref. */
export async function uploadBlob(file: File): Promise<string> {
  const res = await fetch(API.upload, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new ApiError("Upload failed", res.status);
  const { key } = (await res.json()) as { key: string };
  return key;
}

/** The URL to render a stored original. Never a raw R2 URL. */
export const blobUrl = (key: string) => `${API.blob}${qs({ key })}`;

/* ---------------- tasks, sessions, grants ---------------- */

export const createTask = (title: string, instruction = "") =>
  req<{ task: Task }>(API.task, { method: "POST", body: JSON.stringify({ title, instruction }) });

export const listTasks = () => req<{ tasks: Task[] }>(API.task);

export const startAgentSession = (taskId: string, declared?: Record<string, string> | null) =>
  req<{ agent_session_id: string }>(API.session, {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, declared: declared ?? null }),
  });

export const listGrants = (taskId: string) =>
  req<{ grants: Grant[] }>(`${API.grants}${qs({ task_id: taskId })}`);

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

export const listArtifacts = () => req<{ artifacts: Artifact[] }>(API.artifacts);

export const getArtifact = (id: string) =>
  req<{ artifact: Artifact; versions: ArtifactVersion[] }>(`${API.artifacts}${qs({ id })}`);

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
  dimension?: string | null;
  target?: Annotation["target"];
}) =>
  req<{ annotation: Annotation }>(API.annotations, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const recordDecision = (versionId: string, decision: ReviewDecision, note?: string) =>
  req<{ version: ArtifactVersion }>(API.decisions, {
    method: "POST",
    body: JSON.stringify({ version_id: versionId, decision, note: note ?? null }),
  });

/* ---------------- taste ---------------- */

export const listTasteSignals = () => req<{ signals: TasteSignal[] }>(API.taste);

export const createTasteSignal = (input: {
  statement: string;
  dimensions: TasteDimension[];
  scope: "personal" | "project";
}) => req<{ signal: TasteSignal }>(API.taste, { method: "POST", body: JSON.stringify(input) });

export const updateTasteSignal = (id: string, status: TasteSignal["status"], statement?: string) =>
  req<{ signal: TasteSignal }>(API.taste, {
    method: "PATCH",
    body: JSON.stringify({ id, status, statement }),
  });

/* ---------------- agent lens ---------------- */

export const getLens = (taskId: string) =>
  req<{
    lens: {
      accesses: { id: string; item_id: string; tool_name: string; at: number }[];
      denials: DenialRecord[];
      audit: { id: string; tool_name: string | null; operation: string; at: number }[];
    };
  }>(`${API.lens}${qs({ task_id: taskId })}`);
