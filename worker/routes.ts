/**
 * JSON handlers for every path in the API const. All mounted under a single
 * SpaceDO instance; each signed-in human gets their own Space inside it.
 */
import {
  API,
  ITEM_TYPES,
  RELATIONSHIPS,
  REVIEW_DECISIONS,
  TASTE_DIMENSIONS,
  confidenceFrom,
  type AccessRecord,
  type ArtifactState,
  type CapabilityInput,
  type GrantLevel,
  type ItemType,
  type Project,
  type ProjectMember,
  type Region,
  type ReviewDecision,
  type Task,
  type TasteDimension,
  type TasteEvent,
  type ToolCallRequest,
} from "@shared/contract";
import { Queries } from "./db/queries";
import { resolveHuman } from "./auth";
import {
  BETA_MAX_USERS,
  QUOTA,
  QUOTA_METRICS,
  UPLOAD_MAX_BYTES,
  consumeQuota,
  quotaPeriod,
  type QuotaMetric,
} from "./quota";
import { authorizedRegionIds, humanRegions, liveGrants, taskIsLive, taskProject } from "./permissions";
import { traverse } from "./graph";
import { handleToolCall } from "./mcp";
import { deriveTasteSignals, statementOverlap } from "./taste/derive";
import { classifyAnnotationDimensions } from "./taste/classifier";
import { extractUrl, isPublicHttpUrl } from "./extract";
import { captionImage } from "./vision";
import { verifyBlobSignature } from "./blob-sign";
import { deriveEdgesForItem } from "./graph-build";
import { drainSpaceMemory, memoryIndexFor } from "./memory-drain";

/**
 * Each signed-in human gets their own Space, keyed to their Clerk id.
 *
 * A single shared space would be owned by whoever opened the app first; every
 * later visitor would have no human access to any region, and since agent
 * authority can never exceed the invoking human's, their agent could do nothing
 * at all.
 */
function spaceIdFor(humanId: string): string {
  return `space-${humanId}`;
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function badRequest(message: string): Response {
  return json({ ok: false, error: message }, { status: 400 });
}

function isOwnedBlobKey(key: string, humanId: string): boolean {
  const prefix = `${spaceIdFor(humanId)}/`;
  const suffix = key.startsWith(prefix) ? key.slice(prefix.length) : "";
  return Boolean(suffix) && !suffix.includes("/") && !suffix.includes("\\") && !suffix.includes("..");
}

export async function handleRoute(
  request: Request,
  env: Env,
  q: Queries,
): Promise<Response> {
  const url = new URL(request.url);

  // A signed blob request carries its own authorization (a signature this
  // server already minted for that key) and deliberately has no session —
  // that's the whole point, an agent fetching independently of the tab the
  // tool call came from. Checked before the session gate below, and only for
  // this one path; every other route is unaffected.
  if (url.pathname === API.blob && url.searchParams.has("sig")) {
    return handleSignedBlob(request, env);
  }

  const human = await resolveHuman(request, env);
  if (!human) return json({ ok: false, error: "Sign in required" }, { status: 401 });

  // Closed-beta gate. Bootstrap claims a slot (or 403s when full); every other
  // route requires an already-claimed slot.
  if (url.pathname === API.bootstrap) {
    const slot = q.claimBetaSlot(human.human_id, BETA_MAX_USERS, Date.now());
    if (slot === null) {
      return json(
        { ok: false, error: "beta_full", message: `The beta is full (${BETA_MAX_USERS} members). Check back later.` },
        { status: 403 },
      );
    }
  } else if (q.betaSlot(human.human_id) === null) {
    return json({ ok: false, error: "beta_required", message: "Open the app first to join the beta." }, { status: 403 });
  }

  switch (url.pathname) {
    case API.bootstrap:
      return await handleBootstrap(request, q, human.human_id);
    case API.quota:
      return handleQuota(q, human.human_id);
    case API.regions:
      return await handleRegions(request, q, human.human_id);
    case API.projects:
      return await handleProjects(request, q, human.human_id);
    case API.projectMembers:
      return await handleProjectMembers(request, q, human.human_id);
    case API.items:
      return await handleItems(request, env, q, human.human_id);
    case API.upload:
      return await handleUpload(request, env, q, human.human_id);
    case API.blob:
      return await handleBlob(request, env, human.human_id);
    case API.provenance:
      return handleProvenance(request, q, human.human_id);
    case API.graph:
      return await handleGraph(request, q, human.human_id);
    case API.task:
      return await handleTask(request, q, human.human_id);
    case API.session:
      return await handleSession(request, q, human.human_id);
    case API.grants:
      return await handleGrants(request, q, human.human_id);
    case API.capabilities:
      return handleCapabilities(request, q, human.human_id);
    case API.toolCall:
      return await handleMcpCall(request, q, human, env);
    case API.artifacts:
      return handleArtifacts(request, q, human.human_id);
    case API.annotations:
      return await handleAnnotations(request, q, human.human_id, env);
    case API.decisions:
      return await handleDecisions(request, q, human.human_id, env);
    case API.taste:
      return await handleTaste(request, q, human.human_id);
    case API.tasteEvidence:
      return handleTasteEvidence(request, q, human.human_id);
    case API.lens:
      return handleLens(request, q, human.human_id);
    case API.stats:
      return handleStats(request, q, human.human_id);
    case API.edges:
      return await handleEdges(request, q, human.human_id);
    case API.itemNotes:
      return await handleItemNotes(request, q, human.human_id);
    case API.memoryStatus:
      return await handleMemoryStatus(request, q, human.human_id, env);
    default:
      return new Response(null, { status: 404 });
  }
}

/* ---------------- bootstrap ---------------- */

async function handleBootstrap(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const existing = q.getSpace(spaceIdFor(humanId));
  if (existing) {
    return json({ ok: true, space: existing, regions: q.listRegions(existing.id) });
  }

  const now = Date.now();
  const spaceId = spaceIdFor(humanId);
  q.insertSpace({ id: spaceId, name: "Archive", owner_id: humanId, kind: "personal", created_at: now });

  for (const r of [
    { name: "Work", slug: "work" },
    { name: "Inspiration", slug: "inspiration" },
    { name: "Personal", slug: "personal" },
  ]) {
    q.insertRegion({
      id: crypto.randomUUID(),
      space_id: spaceId,
      parent_id: null,
      name: r.name,
      slug: r.slug,
      created_at: now,
    });
  }

  return json({ ok: true, space: q.getSpace(spaceId), regions: q.listRegions(spaceId) });
}

/* ---------------- regions ---------------- */

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

/** A folder slug unique within the space; falls back to a suffix on collision. */
function uniqueRegionSlug(q: Queries, spaceId: string, name: string): string {
  const base = slugify(name) || "folder";
  let slug = base;
  for (let n = 2; q.getRegionBySlug(spaceId, slug); n++) slug = `${base}-${n}`;
  return slug;
}

async function handleRegions(request: Request, q: Queries, humanId: string): Promise<Response> {
  const spaceId = spaceIdFor(humanId);
  if (request.method === "GET") {
    return json({ ok: true, regions: q.listRegions(spaceId) });
  }
  if (request.method === "POST") {
    const { name, parent_id } = (await request.json()) as { name?: string; parent_id?: string | null };
    if (!name?.trim()) return badRequest("name required");
    const parent = parent_id ? q.getRegion(parent_id) : null;
    if (parent_id && (!parent || parent.space_id !== spaceId)) return badRequest("unknown parent folder");
    const region: Region = {
      id: crypto.randomUUID(),
      space_id: spaceId,
      parent_id: parent?.id ?? null,
      name: name.trim().slice(0, 80),
      slug: uniqueRegionSlug(q, spaceId, name),
      created_at: Date.now(),
    };
    q.insertRegion(region);
    return json({ ok: true, region });
  }
  if (request.method === "PATCH") {
    const { id, name } = (await request.json()) as { id?: string; name?: string };
    const region = id ? q.getRegion(id) : null;
    if (!region || region.space_id !== spaceId) return badRequest("unknown region");
    if (!name?.trim()) return badRequest("name required");
    const nextName = name.trim().slice(0, 80);
    const nextSlug = slugify(nextName) === region.slug ? region.slug : uniqueRegionSlug(q, spaceId, nextName);
    q.updateRegion(region.id, nextName, nextSlug);
    return json({ ok: true, region: { ...region, name: nextName, slug: nextSlug } });
  }
  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id");
    const region = id ? q.getRegion(id) : null;
    if (!region || region.space_id !== spaceId) return badRequest("unknown region");
    if (q.listRegions(spaceId).length <= 1) return badRequest("keep at least one folder");
    // Cascade children first: region parentage is the canonical folder tree.
    const descendants = (root: string): string[] => {
      const direct = q.listRegions(spaceId).filter((candidate) => candidate.parent_id === root);
      return direct.flatMap((child) => [child.id, ...descendants(child.id)]);
    };
    const ids = [...descendants(region.id), region.id];
    for (const regionId of ids) for (const item of q.listItemsByRegion(regionId)) q.deleteItem(item.id);
    for (let i = ids.length - 1; i >= 0; i--) q.deleteRegion(ids[i]);
    return json({ ok: true, deleted: region.id });
  }
  return badRequest("unsupported method");
}

/* ---------------- projects ---------------- */

function ownedProject(q: Queries, humanId: string, projectId: string): Project | null {
  const project = q.getProject(projectId);
  return project && project.space_id === spaceIdFor(humanId) && project.owner_id === humanId ? project : null;
}

function projectMemberView(q: Queries, member: ProjectMember): ProjectMember & {
  region: Region | null;
  item: ReturnType<Queries["getItem"]>;
} {
  return {
    ...member,
    region: member.region_id ? q.getRegion(member.region_id) : null,
    item: member.item_id ? q.getItem(member.item_id) : null,
  };
}

async function handleProjects(request: Request, q: Queries, humanId: string): Promise<Response> {
  const spaceId = spaceIdFor(humanId);
  if (request.method === "GET") {
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const project = ownedProject(q, humanId, id);
      return project ? json({ ok: true, project }) : badRequest("not found");
    }
    return json({ ok: true, projects: q.listProjects(spaceId).filter((project) => project.owner_id === humanId) });
  }
  if (request.method === "POST") {
    const body = (await request.json()) as { name?: string; description?: string | null };
    const name = body.name?.trim();
    if (!name) return badRequest("name required");
    const now = Date.now();
    const project: Project = {
      id: crypto.randomUUID(),
      space_id: spaceId,
      owner_id: humanId,
      name: name.slice(0, 120),
      description: body.description?.trim().slice(0, 2000) || null,
      created_at: now,
      updated_at: now,
    };
    q.insertProject(project);
    return json({ ok: true, project });
  }
  if (request.method === "PATCH") {
    const body = (await request.json()) as { id?: string; name?: string; description?: string | null };
    const project = body.id ? ownedProject(q, humanId, body.id) : null;
    if (!project) return badRequest("unknown project");
    const name = body.name === undefined ? project.name : body.name.trim();
    if (!name) return badRequest("name required");
    const description = body.description === undefined ? project.description : body.description?.trim().slice(0, 2000) || null;
    q.updateProject(project.id, name.slice(0, 120), description, Date.now());
    return json({ ok: true, project: q.getProject(project.id) });
  }
  return badRequest("unsupported method");
}

async function handleProjectMembers(request: Request, q: Queries, humanId: string): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const memberId = url.searchParams.get("id");
    if (memberId) {
      const member = q.getProjectMember(memberId);
      if (!member || !ownedProject(q, humanId, member.project_id)) return badRequest("not found");
      return json({ ok: true, member: projectMemberView(q, member) });
    }
    const projectId = url.searchParams.get("project_id");
    const project = projectId ? ownedProject(q, humanId, projectId) : null;
    if (!project) return badRequest("unknown project");
    return json({ ok: true, members: q.listProjectMembers(project.id).map((member) => projectMemberView(q, member)) });
  }
  if (request.method === "POST") {
    const body = (await request.json()) as {
      project_id?: string;
      region_id?: string;
      region_slug?: string;
      item_id?: string;
    };
    const project = body.project_id ? ownedProject(q, humanId, body.project_id) : null;
    if (!project) return badRequest("unknown project");
    const region = body.region_id
      ? q.getRegion(body.region_id)
      : body.region_slug
        ? q.getRegionBySlug(project.space_id, body.region_slug)
        : null;
    const item = body.item_id ? q.getItem(body.item_id) : null;
    const hasRegion = Boolean(region);
    const hasItem = Boolean(item);
    if (hasRegion === hasItem) return badRequest("provide exactly one region or item");
    if (region && region.space_id !== project.space_id) return badRequest("unknown region");
    if (item && item.space_id !== project.space_id) return badRequest("unknown item");
    const regionId = region?.id ?? null;
    const itemId = item?.id ?? null;
    if (q.projectMemberForTarget(project.id, regionId, itemId)) return badRequest("already a project member");
    const member: ProjectMember = {
      id: crypto.randomUUID(),
      project_id: project.id,
      region_id: regionId,
      item_id: itemId,
      created_at: Date.now(),
    };
    q.insertProjectMember(member);
    return json({ ok: true, member: projectMemberView(q, member) });
  }
  if (request.method === "DELETE") {
    let memberId = url.searchParams.get("id");
    if (!memberId) {
      const body = (await request.json().catch(() => ({}))) as { id?: string };
      memberId = body.id ?? null;
    }
    const member = memberId ? q.getProjectMember(memberId) : null;
    if (!member || !ownedProject(q, humanId, member.project_id)) return badRequest("unknown membership");
    q.deleteProjectMember(member.id);
    return json({ ok: true, deleted: member.id });
  }
  return badRequest("unsupported method");
}

/* ---------------- items ---------------- */

async function handleItems(request: Request, env: Env, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const regionSlug = url.searchParams.get("region");
    if (regionSlug) {
      const region = q.getRegionBySlug(spaceIdFor(humanId), regionSlug);
      if (!region) return badRequest("unknown region");
      return json({ ok: true, items: q.listItemsByRegion(region.id) });
    }
    return json({ ok: true, items: q.listItemsBySpace(spaceIdFor(humanId)) });
  }
  if (request.method === "POST") {
    const body = (await request.json()) as {
      region_slug: string;
      type: string;
      title: string;
      source_url?: string | null;
      content_ref?: string | null;
      semantic_text?: string | null;
    };
    const region = q.getRegionBySlug(spaceIdFor(humanId), body.region_slug);
    if (!region) return badRequest("unknown region");
    if (!(ITEM_TYPES as readonly string[]).includes(body.type)) return badRequest("unknown item type");
    if (body.source_url && !isPublicHttpUrl(body.source_url)) {
      return badRequest("source_url must use a public http(s) host");
    }
    if (body.content_ref && !isOwnedBlobKey(body.content_ref, humanId)) {
      return badRequest("invalid content_ref");
    }
    const spaceId = spaceIdFor(humanId);
    const now = Date.now();
    const id = crypto.randomUUID();
    q.insertItem({
      id,
      space_id: spaceId,
      region_id: region.id,
      owner_id: humanId,
      type: body.type as ItemType,
      title: body.title,
      source_url: body.source_url ?? null,
      content_ref: body.content_ref ?? null,
      semantic_text: body.semantic_text ?? null,
      metadata: {},
      authority_class: "human_authored",
      created_by: humanId,
      created_at: now,
      updated_at: now,
    });

    // Enrich a captured link: pull the page / tweet content and fold it into the
    // ONE item. Extracted media and referenced links are stored on the item's
    // metadata (metadata.extracted), never spun off as their own cards — the
    // post is the thing you saved. The post text becomes semantic_text so it
    // reaches FTS, retrieval, and the external memory index.
    // Best-effort and inline — a slow or failed fetch still leaves the bare item.
    // ponytail: inline await adds the fetch latency to the capture request; move
    // to ctx.waitUntil or a DO alarm if capture needs to feel instant.
    if (body.source_url && (body.type === "link" || body.type === "note")) {
      const ex = await extractUrl(body.source_url).catch(() => null);
      const parent = q.getItem(id);
      if (ex && parent) {
        const looksRaw = !parent.title.trim() || /^https?:\/\//i.test(parent.title.trim());
        q.updateItem({
          ...parent,
          title: ex.title && looksRaw ? ex.title.slice(0, 140) : parent.title,
          semantic_text: ex.text ?? parent.semantic_text,
          metadata: {
            extracted: {
              text: ex.text,
              images: ex.images,
              links: ex.links,
              author: ex.author,
              kind: ex.kind,
            },
          },
          updated_at: now,
        });
      }
    }

    // An image/screenshot with no human-written description: caption it so an
    // agent — which never receives image bytes through WebMCP, only this text —
    // gets something instead of nothing. A human description always wins; this
    // only fills a gap. Best-effort and inline, same trade-off as the link
    // enrichment above.
    if ((body.type === "image" || body.type === "screenshot") && body.content_ref && !body.semantic_text) {
      const blob = await env.BLOBS.get(body.content_ref).catch(() => null);
      if (blob) {
        const caption = await captionImage(env, new Uint8Array(await blob.arrayBuffer())).catch(() => null);
        const parent = q.getItem(id);
        if (caption && parent) {
          q.updateItem({ ...parent, semantic_text: caption, updated_at: now });
        }
      }
    }
    deriveEdgesForItem(q, q.getItem(id)!, now);

    return json({ ok: true, item: q.getItem(id) });
  }
  if (request.method === "PATCH" || request.method === "DELETE") {
    const spaceId = spaceIdFor(humanId);
    const body = (await request.json().catch(() => ({}))) as {
      ids?: string[];
      id?: string;
      region_slug?: string;
      title?: string;
      semantic_text?: string;
      pinned?: boolean;
    };
    const ids = body.ids ?? (body.id ? [body.id] : []);
    if (ids.length === 0) return badRequest("id or ids required");
    const owned = q.getItems(ids).filter((i) => i.space_id === spaceId);
    if (owned.length === 0) return badRequest("no matching items");

    if (request.method === "DELETE") {
      for (const item of owned) q.deleteItem(item.id);
      return json({ ok: true, deleted: owned.map((i) => i.id) });
    }

    // PATCH: move to another folder and/or rename (rename only makes sense for one item).
    const dest = body.region_slug ? q.getRegionBySlug(spaceId, body.region_slug) : null;
    if (body.region_slug && !dest) return badRequest("unknown region");
    const now = Date.now();
    const single = owned.length === 1;
    for (const item of owned) {
      q.updateItem({
        ...item,
        region_id: dest?.id ?? item.region_id,
        title: single && body.title?.trim() ? body.title.trim().slice(0, 140) : item.title,
        semantic_text:
          single && body.semantic_text !== undefined ? body.semantic_text.trim() || null : item.semantic_text,
        metadata: body.pinned === undefined ? item.metadata : { ...item.metadata, pinned: body.pinned },
        updated_at: now,
      });
    }
    return json({ ok: true, items: q.getItems(owned.map((item) => item.id)) });
  }
  return badRequest("unsupported method");
}


/* ---------------- upload ---------------- */

async function readBodyCapped(request: Request, limit: number): Promise<ArrayBuffer | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

const ZIP_MIMES = new Set([
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.apple.keynote",
]);

const KNOWN_BLOB_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/rtf",
  ...ZIP_MIMES,
]);

const INLINE_BLOB_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

function normalizeMime(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";", 1)[0].trim().toLowerCase();
}

function hasBytes(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((byte, index) => bytes[index] === byte);
}

function isUtf8Text(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function hasSvgSignature(bytes: Uint8Array): boolean {
  const text = new TextDecoder().decode(bytes.subarray(0, 1024));
  return /^\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(text);
}

/** Returns a canonical MIME only when the declared type and file signature agree. */
export function detectSafeUploadMime(contentType: string | null | undefined, body: ArrayBuffer): string | null {
  const mime = normalizeMime(contentType);
  const bytes = new Uint8Array(body);
  if (!KNOWN_BLOB_MIMES.has(mime)) return null;

  if (mime === "image/png") return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? mime : null;
  if (mime === "image/jpeg") return hasBytes(bytes, [0xff, 0xd8, 0xff]) ? mime : null;
  if (mime === "image/gif") {
    const head = new TextDecoder().decode(bytes.subarray(0, 6));
    return head === "GIF87a" || head === "GIF89a" ? mime : null;
  }
  if (mime === "image/webp") {
    const head = new TextDecoder().decode(bytes.subarray(0, 12));
    return head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WEBP" ? mime : null;
  }
  if (mime === "image/bmp") return hasBytes(bytes, [0x42, 0x4d]) ? mime : null;
  if (mime === "image/svg+xml") return hasSvgSignature(bytes) && isUtf8Text(bytes) ? mime : null;
  if (mime === "application/pdf") {
    const head = new TextDecoder().decode(bytes.subarray(0, 5));
    return head === "%PDF-" ? mime : null;
  }
  if (mime === "application/rtf") {
    const head = new TextDecoder().decode(bytes.subarray(0, 5));
    return head === "{\\rtf" && isUtf8Text(bytes) ? mime : null;
  }
  if (ZIP_MIMES.has(mime)) return hasBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ? mime : null;
  return isUtf8Text(bytes) ? mime : null;
}

function blobMime(contentType: string | null | undefined): string {
  const mime = normalizeMime(contentType);
  return KNOWN_BLOB_MIMES.has(mime) ? mime : "application/octet-stream";
}

function blobHeaders(mime: string, etag?: string, crossOrigin = false): Headers {
  const headers = new Headers({
    "content-type": mime,
    "content-disposition": INLINE_BLOB_MIMES.has(mime) ? "inline" : "attachment",
    "cache-control": "private, max-age=31536000, immutable",
    // A signed URL exists specifically to be fetched from outside this
    // origin (an agent's own HTTP client, or an in-browser image render on a
    // different host) — CORP: same-origin would defeat that on the browser
    // paths, so the signed route asks for cross-origin instead.
    "cross-origin-resource-policy": crossOrigin ? "cross-origin" : "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  if (etag) headers.set("etag", etag);
  return headers;
}

/** Fetches `key` from R2 and streams it back, 304-aware. Shared by the session- and signature-authorized blob routes. */
async function streamBlobResponse(env: Env, key: string, request: Request, crossOrigin: boolean): Promise<Response> {
  // Keys are content-addressed (random UUID, never reused), so a hit is safe to
  // cache hard. `onlyIf` lets R2 answer 304 when the caller already holds it.
  const object = await env.BLOBS.get(key, { onlyIf: request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  const mime = blobMime(object.httpMetadata?.contentType);
  if (!("body" in object) || object.body === undefined) {
    return new Response(null, { status: 304, headers: blobHeaders(mime, object.httpEtag, crossOrigin) });
  }
  return new Response(object.body, { headers: blobHeaders(mime, object.httpEtag, crossOrigin) });
}

async function handleUpload(request: Request, env: Env, q: Queries, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const contentType = request.headers.get("content-type");
  // Enforce the cap while streaming. A forged/missing Content-Length can no
  // longer make the Worker buffer an arbitrarily large upload first.
  const body = await readBodyCapped(request, UPLOAD_MAX_BYTES);
  if (body === null) {
    return json(
      { ok: false, error: "file_too_large", message: `Files are capped at ${Math.round(UPLOAD_MAX_BYTES / 1048576)} MB in the beta.` },
      { status: 413 },
    );
  }
  const safeMime = detectSafeUploadMime(contentType, body);
  if (!safeMime) {
    return json({ ok: false, error: "unsupported_or_invalid_file", message: "The file type or signature is not supported." }, { status: 415 });
  }
  const over = meter(q, humanId, "uploads");
  if (over) return over;
  const key = `${spaceIdFor(humanId)}/${crypto.randomUUID()}`;
  await env.BLOBS.put(key, body, {
    httpMetadata: {
      contentType: safeMime,
      contentDisposition: INLINE_BLOB_MIMES.has(safeMime) ? "inline" : "attachment",
    },
  });
  return json({ ok: true, key });
}

/**
 * Streams a canonical original back out of R2, for this app's own signed-in UI.
 *
 * Keys are confined to this visitor's own space prefix, so a caller can neither
 * walk out of the bucket with a crafted key nor read another visitor's uploads. The agent never receives a bucket
 * credential or a raw R2 URL — it only ever sees this path (or, for an agent
 * fetching independently of a session, handleSignedBlob below — same path,
 * an expiring signature instead of a cookie).
 */
async function handleBlob(request: Request, env: Env, humanId: string): Promise<Response> {
  if (request.method !== "GET") return badRequest("GET required");
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return badRequest("key required");
  if (!key.startsWith(`${spaceIdFor(humanId)}/`) || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  return streamBlobResponse(env, key, request, false);
}

/**
 * The same canonical blob, for a caller with no session — an agent fetching
 * a content_url it received from a tool result, independently of the
 * browser tab the tool call came from. Authorization here is possession of
 * a valid, unexpired signature: the server only ever mints one for a key it
 * already decided this agent could see, at the moment a tool call resolved
 * that item (worker/mcp.ts's slimItem) — this route re-derives nothing about
 * grants or task scope, it only checks the signature and expiry.
 */
async function handleSignedBlob(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return badRequest("GET required");
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
  const ok = await verifyBlobSignature(
    env.BLOB_SIGNING_SECRET,
    key,
    url.searchParams.get("exp"),
    url.searchParams.get("sig"),
  );
  if (!ok) return new Response("Not found", { status: 404 });
  return streamBlobResponse(env, key, request, true);
}

/**
 * The three provenance record types for one artifact version, kept separate.
 *
 *   influences → "Used these references"
 *   accesses   → "Accessed for this task"
 *   denials    → "Unavailable or denied" (Agent Lens only)
 *
 * Merging these would erase the distinction between what shaped the work, what
 * was merely looked at, and what was refused. See BUILD-CONTRACT invariant 5.
 */
function handleProvenance(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const versionId = new URL(request.url).searchParams.get("version_id");
  if (!versionId) return badRequest("version_id required");

  const version = q.getArtifactVersion(versionId);
  if (!version) return badRequest("unknown version");
  const artifact = q.getArtifact(version.artifact_id);
  if (!artifact) return badRequest("unknown artifact");
  // Ids are guessable in principle; ownership is the actual boundary.
  if (artifact.space_id !== spaceIdFor(humanId)) return badRequest("unknown version");

  const influences = q
    .listInfluences(versionId)
    .map((inf) => ({ ...inf, item: q.getItem(inf.item_id) ?? null }))
    .filter((inf) => inf.item?.space_id === artifact.space_id);

  // Accessed-but-not-influential: retrieved during the task, minus anything
  // already credited as an influence.
  const influenced = new Set(influences.map((i) => i.item_id));
  const accesses = q
    .recentAccesses(artifact.task_id, 200)
    .filter((a: AccessRecord) => !influenced.has(a.item_id))
    .map((a: AccessRecord) => ({ ...a, item: q.getItem(a.item_id) ?? null }))
    .filter((access) => access.item?.space_id === artifact.space_id);

  return json({
    ok: true,
    provenance: {
      influences,
      accesses,
      denials: q.recentDenials(artifact.task_id, 50),
    },
  });
}

/* ---------------- graph ---------------- */

async function handleGraph(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const url = new URL(request.url);
  const taskId = url.searchParams.get("task_id");
  if (!taskId) return badRequest("task_id required");
  const task = q.getTask(taskId);
  if (!task || task.human_id !== humanId) return badRequest("unknown task");
  const body = (await request.json()) as { seed_item_ids: string[] };
  const allowed = authorizedRegionIds(q, taskId, Date.now());
  const result = traverse(q, body.seed_item_ids, allowed);
  return json({ ok: true, ...result });
}

/* ---------------- task ---------------- */

/**
 * Registers an agent session. The id is issued by the SERVER, never accepted
 * from the client — an agent must not be able to name its own session and so
 * pick which human or task it appears to belong to.
 *
 * `declared` is attribution only. It is stored for the history ledger and never
 * read during authorization (BUILD-CONTRACT invariant 9).
 */
async function handleSession(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("unsupported method");
  const body = (await request.json()) as {
    task_id: string;
    declared?: { provider?: string; client?: string; model?: string } | null;
  };

  const task = q.getTask(body.task_id);
  if (!task) return badRequest("unknown task");
  // A session may only be bound to a task the caller actually owns.
  if (task.human_id !== humanId || !taskIsLive(task, Date.now())) return badRequest("task is no longer active");

  const id = crypto.randomUUID();
  q.insertAgentSession({
    id,
    human_id: humanId,
    task_id: body.task_id,
    declared: body.declared ?? null,
    created_at: Date.now(),
  });
  return json({ ok: true, agent_session_id: id });
}

function taskResponse(q: Queries, task: Task | null): unknown {
  if (!task) return null;
  const project = taskProject(q, task);
  return {
    ...task,
    scope: {
      project_id: task.project_id ?? null,
      project_name: project?.name ?? null,
    },
  };
}

async function handleTask(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "POST") {
    const body = (await request.json()) as {
      title: string;
      instruction?: string;
      project_id?: string | null;
      expires_at?: number | null;
    };
    const projectId = body.project_id ?? null;
    if (projectId !== null && !ownedProject(q, humanId, projectId)) return badRequest("unknown project");
    const id = crypto.randomUUID();
    q.insertTask({
      id,
      space_id: spaceIdFor(humanId),
      project_id: projectId,
      human_id: humanId,
      title: body.title,
      instruction: body.instruction ?? "",
      status: "open",
      created_at: Date.now(),
      expires_at: body.expires_at ?? null,
    });
    return json({ ok: true, task: taskResponse(q, q.getTask(id)) });
  }
  if (request.method === "GET") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const task = q.getTask(id);
      if (!task || task.human_id !== humanId) return badRequest("not found");
      return json({ ok: true, task: taskResponse(q, task) });
    }
    // Only the caller's own tasks. Without this
    // filter one visitor would see another's tasks and try to bind an agent
    // session to work that is not theirs — which the session route correctly
    // refuses, leaving the app wedged. Several judges will use this at once.
    return json({
      ok: true,
      tasks: q.listTasks(spaceIdFor(humanId)).filter((t) => t.human_id === humanId).map((task) => taskResponse(q, task)),
    });
  }
  if (request.method === "PATCH") {
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      instruction?: string;
      project_id?: string | null;
      expires_at?: number | null;
    };
    const task = body.id ? q.getTask(body.id) : null;
    if (!task || task.human_id !== humanId) return badRequest("unknown task");
    const projectId = body.project_id === undefined ? undefined : body.project_id;
    if (projectId !== undefined && projectId !== null && !ownedProject(q, humanId, projectId)) {
      return badRequest("unknown project");
    }
    const title = body.title === undefined ? undefined : body.title.trim();
    if (title !== undefined && !title) return badRequest("title required");
    q.updateTask(task.id, {
      title: title?.slice(0, 160),
      instruction: body.instruction,
      project_id: projectId,
      expires_at: body.expires_at,
    });
    return json({ ok: true, task: taskResponse(q, q.getTask(task.id)) });
  }
  return badRequest("unsupported method");
}

/* ---------------- grants ---------------- */

async function handleGrants(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "POST") {
    const body = (await request.json()) as { task_id: string; region_slug: string; level: GrantLevel; expires_at?: number | null };
    const task = q.getTask(body.task_id);
    if (!task || task.human_id !== humanId) return badRequest("unknown task");
    if (!taskIsLive(task, Date.now())) return badRequest("task is no longer active");
    const region = q.getRegionBySlug(spaceIdFor(humanId), body.region_slug);
    if (!region) return badRequest("unknown region");

    // Setting a region's level SUPERSEDES whatever it was before. Any live grant
    // on this region is revoked first.
    //
    // Without this, each change from the lock control would stack another row and
    // the earliest, most permissive one would keep winning — the UI would show a
    // downgrade while the agent's real authority never moved. That is exactly the
    // "permission theater" this product exists to disprove, so it is enforced
    // here and, defensively, again in authorize().
    const now = Date.now();
    for (const g of q.grantsForTask(body.task_id)) {
      if (g.region_id === region.id && g.revoked_at === null) {
        q.revokeGrant(g.id, humanId, "superseded", now);
      }
    }

    // "none" is the absence of a grant, not a grant of nothing. Revoking is the
    // whole operation — inserting a none-level row would leave something for a
    // buggy lookup to find.
    if (body.level === "none") {
      return json({ ok: true, revoked: true, region: region.slug });
    }

    const id = crypto.randomUUID();
    q.insertGrant({
      id,
      task_id: body.task_id,
      space_id: spaceIdFor(humanId),
      region_id: region.id,
      level: body.level,
      grantor_id: humanId,
      created_at: Date.now(),
      expires_at: body.expires_at ?? null,
      revoked_at: null,
      revoked_by: null,
      reason: null,
    });
    return json({ ok: true, grant: q.getGrant(id) });
  }
  if (request.method === "PATCH") {
    const body = (await request.json()) as { grant_id: string; reason?: string };
    const grant = q.getGrant(body.grant_id);
    const task = grant ? q.getTask(grant.task_id) : null;
    if (!grant || !task || task.human_id !== humanId) return badRequest("unknown grant");
    q.revokeGrant(grant.id, humanId, body.reason ?? null, Date.now());
    return json({ ok: true, grant: q.getGrant(body.grant_id) });
  }
  if (request.method === "GET") {
    const url = new URL(request.url);
    const taskId = url.searchParams.get("task_id");
    if (!taskId) return badRequest("task_id required");
    const task = q.getTask(taskId);
    if (!task || task.human_id !== humanId) return badRequest("unknown task");
    return json({ ok: true, grants: liveGrants(q, taskId, Date.now()) });
  }
  return badRequest("unsupported method");
}

/* ---------------- capabilities ---------------- */

function handleCapabilities(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const url = new URL(request.url);
  const taskId = url.searchParams.get("task_id");
  const activeArtifactId = url.searchParams.get("artifact_id");
  if (!taskId) return badRequest("task_id required");
  const task = q.getTask(taskId);
  if (!task) return badRequest("unknown task");
  if (task.human_id !== humanId) return badRequest("unknown task");
  const activeArtifact = activeArtifactId ? q.getArtifact(activeArtifactId) : null;
  const artifactIsInTask = activeArtifact?.task_id === task.id && activeArtifact.space_id === task.space_id;
  const taskIsActive = taskIsLive(task, Date.now());

  const regions = q.listRegions(task.space_id);
  const slugById = new Map(regions.map((r) => [r.id, r.slug]));
  const human = humanRegions(q, task.space_id, task.human_id).map((r) => ({
    slug: slugById.get(r.region_id) ?? "",
    level: r.level,
  }));
  const grants = liveGrants(q, taskId, Date.now()).map((g) => ({
    slug: slugById.get(g.region_id) ?? "",
    level: g.level,
  }));
  const project = taskProject(q, task);

  const payload: CapabilityInput = {
    humanRegions: human,
    grants,
    task: taskIsActive
      ? { id: task.id, title: task.title, expires_at: task.expires_at, project_id: task.project_id ?? null }
      : null,
    scope: {
      project_id: task.project_id ?? null,
      project_name: project?.name ?? null,
    },
    pageState: {
      hasPendingProposals: false,
      activeArtifactId: taskIsActive && artifactIsInTask ? activeArtifactId : null,
    },
  };
  return json({ ok: true, capabilities: payload });
}

/* ---------------- mcp call ---------------- */

async function handleMcpCall(
  request: Request,
  q: Queries,
  human: { human_id: string },
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const over = meter(q, human.human_id, "agent_calls");
  if (over) return over;
  const body = (await request.json()) as ToolCallRequest;
  const result = await handleToolCall(body, q, human, Date.now(), env, new URL(request.url).origin);
  if (result.ok) {
    const session = q.getAgentSession(body.agent_session_id);
    q.insertAuditEvent({
      id: crypto.randomUUID(),
      actor_type: "agent",
      actor_label: session?.declared?.client ?? "Agent",
      agent_session_id: body.agent_session_id,
      human_id: human.human_id,
      task_id: body.task_id,
      tool_name: body.tool,
      operation: "tool_call",
      payload: { input: body.input },
      at: Date.now(),
    });
  }
  return json(result, { status: result.ok ? 200 : 403 });
}

/** Server-written submission placement. Separate from influence provenance. */
function submittedRegionId(contentHtml: string): string | null {
  const match = contentHtml.match(/<meta\s+name=["']gotothearchive-region["']\s+content=["']([^"']+)["']\s*\/?>/i);
  return match?.[1] ?? null;
}

/* ---------------- artifacts ---------------- */

function handleArtifacts(request: Request, q: Queries, humanId: string): Response {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (request.method === "DELETE") {
    if (!id) return badRequest("id required");
    const artifact = q.getArtifact(id);
    if (!artifact || artifact.space_id !== spaceIdFor(humanId)) return badRequest("not found");
    q.deleteArtifact(id);
    return json({ ok: true, deleted: id });
  }
  if (request.method !== "GET") return badRequest("GET required");
  if (id) {
    const artifact = q.getArtifact(id);
    if (!artifact || artifact.space_id !== spaceIdFor(humanId)) return badRequest("not found");
    return json({ ok: true, artifact, versions: q.listArtifactVersions(id) });
  }
  const spaceId = spaceIdFor(humanId);
  const regionsBySlug = q.listRegions(spaceId);
  const regionById = new Map(regionsBySlug.map((r) => [r.id, r.slug]));
  const artifacts = q.listArtifacts(spaceId).map((a) => {
    const versions = q.listArtifactVersions(a.id);
    const latest = versions[versions.length - 1];
    const influences = latest ? q.listInfluences(latest.id) : [];
    const items = q.getItems(influences.map((i) => i.item_id));
    const influencedRegions = items.map((it) => regionById.get(it.region_id)).filter((slug): slug is string => Boolean(slug));
    // Placement never masquerades as provenance: use the submitted folder only
    // when an artifact has no real influences to group by.
    const submittedRegion = latest ? regionById.get(submittedRegionId(latest.content_html) ?? "") : undefined;
    const regions = [...new Set(influencedRegions.length > 0 ? influencedRegions : submittedRegion ? [submittedRegion] : [])];
    return {
      ...a,
      version_count: versions.length,
      state: latest?.state ?? "draft",
      updated_at: latest?.created_at ?? a.created_at,
      preview_html: latest?.content_html ?? "",
      influence_count: influences.length,
      regions,
    };
  });
  return json({ ok: true, artifacts });
}

/* ---------------- annotations ---------------- */

/** Keep only real taste-dimension slugs, de-duplicated, capped. */
function cleanDimensions(input: unknown): TasteDimension[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v === "string" && (TASTE_DIMENSIONS as readonly string[]).includes(v)) seen.add(v);
  }
  return [...seen].slice(0, 6) as TasteDimension[];
}

/**
 * The taste loop groups annotations by dimension, so a note with no dimensions
 * derives nothing. The manual dimension picker was removed from the UI; a human
 * note now gets its dimensions inferred from its own text. An explicit list
 * (WebMCP record_feedback, or a future UI) still wins. `env` unused for now —
 * keyword classification only, deterministic and free; pass `env.AI` here to
 * upgrade to the model path (see worker/taste/classifier.ts).
 */
async function resolveAnnotationDimensions(
  _env: Env,
  explicit: unknown,
  ctx: { title: string; comment: string; authorId: string; sentiment: "positive" | "negative" | "neutral" },
): Promise<TasteDimension[]> {
  const chosen = cleanDimensions(explicit);
  if (chosen.length > 0) return chosen;
  return classifyAnnotationDimensions(undefined, ctx);
}

async function handleAnnotations(request: Request, q: Queries, humanId: string, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const versionId = url.searchParams.get("version_id");
    if (!versionId) return badRequest("version_id required");
    const version = q.getArtifactVersion(versionId);
    const artifact = version ? q.getArtifact(version.artifact_id) : null;
    if (!version || !artifact || artifact.space_id !== spaceIdFor(humanId)) return badRequest("unknown version");
    return json({ ok: true, annotations: q.listAnnotations(versionId) });
  }
  if (request.method === "POST") {
    const body = (await request.json()) as {
      version_id: string;
      sentiment: "positive" | "negative" | "neutral";
      comment: string;
      dimensions?: TasteDimension[];
      target?: { kind: "region"; x: number; y: number; w: number; h: number } | null;
    };
    const version = q.getArtifactVersion(body.version_id);
    const artifact = version ? q.getArtifact(version.artifact_id) : null;
    if (!version || !artifact || artifact.space_id !== spaceIdFor(humanId)) return badRequest("unknown version");
    const id = crypto.randomUUID();
    q.insertAnnotation({
      id,
      version_id: body.version_id,
      author_id: humanId,
      target: body.target ?? null,
      sentiment: body.sentiment,
      dimensions: await resolveAnnotationDimensions(env, body.dimensions, {
        title: artifact.title,
        comment: body.comment,
        authorId: humanId,
        sentiment: body.sentiment,
      }),
      comment: body.comment,
      status: "open",
      created_at: Date.now(),
    });
    // Step 5 of the taste loop: this new note may complete a candidate signal.
    await deriveTasteSignals(q, spaceIdFor(humanId), Date.now(), env);
    return json({ ok: true, annotation: { id } });
  }
  if (request.method === "PATCH") {
    const body = (await request.json()) as {
      id: string;
      comment?: string;
      sentiment?: "positive" | "negative" | "neutral";
      dimensions?: TasteDimension[];
    };
    const existing = q.getAnnotation(body.id);
    if (!existing) return badRequest("unknown annotation");
    // A person may only edit their own note.
    if (existing.author_id !== humanId) return badRequest("not your note");
    const nextComment = typeof body.comment === "string" ? body.comment : undefined;
    const nextSentiment = body.sentiment ?? existing.sentiment;
    // Re-infer dimensions when the text changed and the caller gave no explicit
    // list, so an edited note still lands in the right taste group.
    let nextDimensions: TasteDimension[] | undefined;
    if (Array.isArray(body.dimensions)) {
      nextDimensions = cleanDimensions(body.dimensions);
    } else if (nextComment !== undefined && nextComment !== existing.comment) {
      const version = q.getArtifactVersion(existing.version_id);
      const artifact = version ? q.getArtifact(version.artifact_id) : null;
      nextDimensions = await resolveAnnotationDimensions(env, undefined, {
        title: artifact?.title ?? "",
        comment: nextComment,
        authorId: humanId,
        sentiment: nextSentiment,
      });
    }
    q.updateAnnotation(body.id, {
      comment: nextComment,
      sentiment: body.sentiment,
      dimensions: nextDimensions,
    });
    await deriveTasteSignals(q, spaceIdFor(humanId), Date.now(), env);
    return json({ ok: true, annotation: q.getAnnotation(body.id) });
  }
  return badRequest("unsupported method");
}

/* ---------------- decisions ---------------- */

async function handleDecisions(request: Request, q: Queries, humanId: string, env: Env): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const body = (await request.json()) as { version_id: string; decision: string; note?: string | null };
  if (!(REVIEW_DECISIONS as readonly string[]).includes(body.decision)) {
    return badRequest("unknown decision");
  }
  const decision = body.decision as ReviewDecision;
  const version = q.getArtifactVersion(body.version_id);
  if (!version) return badRequest("unknown version");
  const artifact = q.getArtifact(version.artifact_id);
  if (!artifact || artifact.space_id !== spaceIdFor(humanId)) return badRequest("unknown version");
  const now = Date.now();
  q.insertDecision({
    id: crypto.randomUUID(),
    version_id: body.version_id,
    actor_id: humanId,
    decision,
    note: body.note ?? null,
    prev_state: version.state,
    at: now,
  });
  const nextState: ArtifactState =
    decision === "approve"
      ? "approved"
      : decision === "approve_with_notes"
        ? "approved_with_notes"
        : decision === "request_changes"
          ? "changes_requested"
          : "rejected";
  q.setArtifactVersionState(body.version_id, nextState);
  // An agent artifact becomes Archive context only after a human approves it,
  // and only when it records real Archive material as influence. This keeps
  // Workbench drafts out of canonical context and prevents self-referential
  // learning from ungrounded output.
  if ((nextState === "approved" || nextState === "approved_with_notes") && version.agent_session_id) {
    const influences = q.listInfluences(version.id);
    const influencedDestination = influences.length > 0 ? q.getItem(influences[0].item_id) : null;
    const destinationRegion = submittedRegionId(version.content_html) ?? influencedDestination?.region_id;
    const alreadyPromoted = q
      .listItemsBySpace(artifact.space_id)
      .some((item) => item.metadata.artifact_version_id === version.id);
    if (destinationRegion && q.getRegion(destinationRegion)?.space_id === artifact.space_id && !alreadyPromoted) {
      q.insertItem({
        id: crypto.randomUUID(),
        space_id: artifact.space_id,
        region_id: destinationRegion,
        owner_id: humanId,
        type: "document",
        title: artifact.title,
        source_url: null,
        content_ref: null,
        semantic_text: version.content_html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12_000),
        metadata: {
          artifact_id: artifact.id,
          artifact_version_id: version.id,
          promoted_from_workbench: true,
          preview_html: version.content_html,
          renderer: /<meta\s+name=["']gotothearchive-renderer["']\s+content=["']component["']/i.test(version.content_html)
            ? "component"
            : "static",
        },
        authority_class: "agent_artifact",
        created_by: `agent:${version.agent_session_id}`,
        created_at: now,
        updated_at: now,
      });
    }
  }
  await deriveTasteSignals(q, spaceIdFor(humanId), now, env);
  return json({ ok: true, version: q.getArtifactVersion(body.version_id) });
}

/* ---------------- taste ---------------- */

function logTasteEvent(
  q: Queries,
  signalId: string,
  kind: TasteEvent["kind"],
  actor: TasteEvent["actor_type"],
  detail = "",
  versionId: string | null = null,
  agentSessionId: string | null = null,
): void {
  q.insertTasteEvent({
    id: crypto.randomUUID(),
    signal_id: signalId,
    kind,
    actor_type: actor,
    actor_label: actor === "human" ? "You" : actor === "agent" ? "Agent" : "System",
    agent_session_id: agentSessionId,
    detail,
    version_id: versionId,
    at: Date.now(),
  });
}

async function handleTaste(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "GET") {
    const spaceId = spaceIdFor(humanId);
    const signals = q.listTasteSignals(spaceId).filter((signal) => signal.owner_id === humanId);
    const signalIds = new Set(signals.map((signal) => signal.id));
    // Hydrate each activity event with a thumbnail: the artifact it shaped
    // (preview HTML) or the first source item its signal cites (image / host).
    const recent_events = q.recentTasteEvents(spaceId, 14).filter((event) => signalIds.has(event.signal_id)).map((e) => {
      let artifact: { title: string; preview_html: string } | null = null;
      if (e.version_id) {
        const v = q.getArtifactVersion(e.version_id);
        const a = v ? q.getArtifact(v.artifact_id) : null;
        if (a && a.space_id === spaceId && v) artifact = { title: a.title, preview_html: v.content_html };
      }
      const cited = q.listTasteEvidence(e.signal_id).find((ev) => ev.item_id);
      const candidate = cited?.item_id ? q.getItem(cited.item_id) : null;
      const item = candidate?.space_id === spaceId ? candidate : null;
      return { ...e, artifact, item };
    });
    return json({ ok: true, signals, recent_events });
  }
  if (request.method === "POST") {
    const body = (await request.json()) as {
      statement: string;
      dimensions: TasteDimension[];
      scope: "personal" | "project";
      project_id?: string | null;
    };
    if (body.scope !== "personal" && body.scope !== "project") return badRequest("unknown taste scope");
    if (!body.statement?.trim()) return badRequest("statement required");
    if (body.scope === "personal" && body.project_id !== undefined && body.project_id !== null) {
      return badRequest("personal taste cannot name a project");
    }
    const projectId = body.scope === "project" ? body.project_id ?? null : null;
    if (body.scope === "project" && (!projectId || !ownedProject(q, humanId, projectId))) {
      return badRequest("unknown project");
    }
    const id = crypto.randomUUID();
    q.insertTasteSignal({
      id,
      space_id: spaceIdFor(humanId),
      owner_id: humanId,
      statement: body.statement.trim(),
      dimensions: cleanDimensions(body.dimensions),
      scope: body.scope,
      project_id: projectId,
      status: "proposed",
      confidence: 0.5,
      created_by: "human",
      approved_by: null,
      supersedes: null,
      created_at: Date.now(),
    });
    logTasteEvent(q, id, "proposed", "human", "Added by hand");
    return json({ ok: true, signal: q.getTasteSignal(id) });
  }
  if (request.method === "PATCH") {
    const body = (await request.json()) as {
      id: string;
      status?: "proposed" | "confirmed" | "rejected" | "superseded";
      statement?: string;
      scope?: "personal" | "project";
      project_id?: string | null;
    };
    const existing = q.getTasteSignal(body.id);
    if (!existing || existing.space_id !== spaceIdFor(humanId) || existing.owner_id !== humanId) {
      return badRequest("unknown signal");
    }
    if (body.scope !== undefined && body.scope !== "personal" && body.scope !== "project") {
      return badRequest("unknown taste scope");
    }
    const desiredScope = body.scope ?? existing.scope;
    const desiredProjectId = desiredScope === "personal" ? null : body.project_id !== undefined ? body.project_id : existing.project_id ?? null;
    if (desiredScope === "personal" && body.project_id !== undefined && body.project_id !== null) {
      return badRequest("personal taste cannot name a project");
    }
    if (desiredScope === "project" && (!desiredProjectId || !ownedProject(q, humanId, desiredProjectId))) {
      return badRequest("unknown project");
    }

    // Editing and rescoping are first-class review actions, not just status
    // changes: the doc's actions are accept, edit, rescope, reject. Dropping the
    // statement here would make the edit UI silently fail — the worst outcome
    // for a surface whose whole promise is that nothing changes without you.
    if (typeof body.statement === "string" && body.statement.trim() && body.statement.trim() !== existing.statement) {
      const next = body.statement.trim();
      // A materially different claim on a confirmed signal is a bitemporal
      // correction (retrieval-architecture.md §3.3), not an in-place edit: the
      // old judgement stays on the record, the new one supersedes it. Minor
      // rewording (≥ 40% word overlap) keeps the in-place update.
      if (existing.status === "confirmed" && statementOverlap(existing.statement, next) < 0.4) {
        const newId = crypto.randomUUID();
        q.insertTasteSignal({
          id: newId,
          space_id: existing.space_id,
          owner_id: existing.owner_id,
          statement: next,
          dimensions: existing.dimensions,
          scope: desiredScope,
          project_id: desiredProjectId,
          status: "confirmed",
          confidence: existing.confidence,
          created_by: "human",
          approved_by: humanId,
          created_at: Date.now(),
          supersedes: existing.id,
        });
        q.copyTasteEvidence(existing.id, newId);
        q.supersedeTasteSignal(existing.id, newId);
        logTasteEvent(q, existing.id, "superseded", "human", "Replaced by a materially different statement");
        logTasteEvent(q, newId, "edited", "human", "Rewrote as a new claim");
        const counts = q.tasteEvidenceCounts(newId);
        q.setTasteSignalConfidence(newId, confidenceFrom(counts.supporting, counts.contradicting));
        return json({ ok: true, signal: q.getTasteSignal(newId) });
      }
      q.setTasteSignalStatement(body.id, next);
      logTasteEvent(q, body.id, "edited", "human", "Reworded the statement");
    }
    if (desiredScope !== existing.scope || desiredProjectId !== (existing.project_id ?? null)) {
      if (desiredScope === "personal") q.setTasteSignalScope(body.id, "personal");
      else q.setTasteSignalProject(body.id, desiredProjectId);
      logTasteEvent(q, body.id, "rescoped", "human", `Moved to ${desiredScope}`);
    }
    if (body.status && body.status !== existing.status) {
      q.setTasteSignalStatus(body.id, body.status, humanId);
      const kind = body.status === "confirmed" ? "accepted" : body.status === "rejected" ? "rejected" : "superseded";
      logTasteEvent(q, body.id, kind, "human");
      // Confidence is derived from evidence, recomputed whenever it changes.
      const counts = q.tasteEvidenceCounts(body.id);
      q.setTasteSignalConfidence(body.id, confidenceFrom(counts.supporting, counts.contradicting));
    }
    return json({ ok: true, signal: q.getTasteSignal(body.id) });
  }
  return badRequest("unsupported method");
}

/* ---------------- taste evidence ---------------- */

/**
 * The evidence behind one taste signal, hydrated into the annotations, versions
 * and items it cites.
 *
 * A proposal that cannot show its evidence is just an assertion, and the product
 * promises the opposite: signals cite the feedback and artifacts that support
 * them, and are never confirmed through silence.
 */
function handleTasteEvidence(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const signalId = new URL(request.url).searchParams.get("signal_id");
  if (!signalId) return badRequest("signal_id required");

  // Evidence quotes a person's own annotations. Only its owner may read it.
  const signal = q.getTasteSignal(signalId);
  if (!signal || signal.space_id !== spaceIdFor(humanId)) return badRequest("unknown signal");

  const evidence = q.listTasteEvidence(signalId).map((e) => ({
    ...e,
    annotation: e.annotation_id ? (q.getAnnotation(e.annotation_id) ?? null) : null,
    item: e.item_id ? (q.getItem(e.item_id) ?? null) : null,
  }));
  const events = q.listTasteEvents(signalId).map((e) => ({
    ...e,
    artifact: e.version_id
      ? (() => {
          const v = q.getArtifactVersion(e.version_id!);
          const a = v ? q.getArtifact(v.artifact_id) : null;
          return a ? { id: a.id, title: a.title, version_no: v!.version_no } : null;
        })()
      : null,
  }));
  return json({ ok: true, evidence, events });
}

/* ---------------- stats ---------------- */

const bumpCount = (m: Record<string, number>, k: string, n = 1) => (m[k] = (m[k] ?? 0) + n);

function sortedCopy<T>(values: Iterable<T>, compare: (a: T, b: T) => number): T[] {
  const copy = [...values];
  // oxlint-disable-next-line unicorn/no-array-sort -- copy is always fresh
  copy.sort(compare);
  return copy;
}

const sortedRows = (m: Record<string, number>) =>
  sortedCopy(
    Object.entries(m).map(([label, value]) => ({ label, value })),
    (a, b) => b.value - a.value,
  );

/** "chatgpt-desktop" → "ChatGPT", "claude-code" → "Claude", etc. */
function prettyClient(name: string): string {
  const base = name.replace(/[-_](desktop|cli|code|web|app)$/i, "").replace(/[-_]/g, " ").trim();
  const known: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude" };
  return known[base.toLowerCase()] ?? base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function handleStats(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const spaceId = spaceIdFor(humanId);

  const audit = q.spaceAuditEvents(spaceId, 800);
  const sessions = new Map(q.listAgentSessions(spaceId).map((s) => [s.id, s]));
  const items = q.listItemsBySpace(spaceId);
  const regionName = new Map(q.listRegions(spaceId).map((r) => [r.id, r.name]));
  const tasteApps = q.spaceTasteApplications(spaceId);

  // Activity heatmap + tool use.
  const activity_by_day: Record<string, number> = {};
  const toolCounts: Record<string, number> = {};
  for (const e of audit) {
    bumpCount(activity_by_day, new Date(e.at).toISOString().slice(0, 10));
    bumpCount(toolCounts, e.tool_name || e.operation);
  }
  // Access records remain provenance, but are already represented by their
  // successful WebMCP tool-call audit event. Counting both would inflate the
  // human-facing activity totals.

  // Per-agent contributions.
  type Agg = { label: string; provider: string; actions: number; artifacts: number; taste: number };
  const agents = new Map<string, Agg>();
  const clientFor = (sid: string | null): Agg | null => {
    if (!sid) return null;
    const d = sessions.get(sid)?.declared;
    if (!d?.client) return null;
    const label = prettyClient(d.client);
    if (!agents.has(label)) agents.set(label, { label, provider: d.provider ?? "", actions: 0, artifacts: 0, taste: 0 });
    return agents.get(label)!;
  };
  for (const e of audit) {
    const agg = clientFor(e.agent_session_id);
    if (agg) agg.actions += 1;
  }
  for (const ta of tasteApps) {
    const agg = clientFor(ta.agent_session_id);
    if (agg) agg.taste += 1;
  }

  const artifacts = q.listArtifacts(spaceId);
  const outcomeCounts: Record<string, number> = {};
  const latest: { id: string; title: string; preview_html: string; updated_at: number }[] = [];
  for (const a of artifacts) {
    const versions = q.listArtifactVersions(a.id);
    const last = versions[versions.length - 1];
    if (!last) continue;
    bumpCount(outcomeCounts, last.state);
    for (const v of versions) {
      const agg = clientFor(v.agent_session_id);
      if (agg) agg.artifacts += 1;
    }
    latest.push({ id: a.id, title: a.title, preview_html: last.content_html, updated_at: last.created_at });
  }

  const folderCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  for (const it of items) {
    bumpCount(folderCounts, regionName.get(it.region_id) ?? "Other");
    if (it.source_url) {
      try {
        bumpCount(sourceCounts, new URL(it.source_url).hostname.replace(/^www\./, ""));
      } catch {
        // ignore unparseable source urls
      }
    }
  }

  // Taste learning: signal mix, how often signals get applied, which ones most.
  const signals = q.listTasteSignals(spaceId);
  const statementById = new Map(signals.map((s) => [s.id, s.statement]));
  const appliedByDay: Record<string, number> = {};
  const appliedBySignal: Record<string, number> = {};
  for (const ta of tasteApps) {
    bumpCount(appliedByDay, new Date(ta.at).toISOString().slice(0, 10));
    bumpCount(appliedBySignal, ta.signal_id);
  }
  const dimensionCounts: Record<string, number> = {};
  for (const s of signals) for (const d of s.dimensions) bumpCount(dimensionCounts, d.replace(/_/g, " "));

  return json({
    ok: true,
    stats: {
      totals: { items: items.length, artifacts: artifacts.length, actions: audit.length },
      activity_by_day,
      tools: sortedRows(toolCounts).slice(0, 8),
      agents: sortedCopy(agents.values(), (a, b) => b.actions - a.actions),
      folders: sortedRows(folderCounts),
      sources: sortedRows(sourceCounts).slice(0, 8),
      outcomes: sortedRows(outcomeCounts),
      latest: sortedCopy(latest, (a, b) => b.updated_at - a.updated_at).slice(0, 6),
      taste: {
        total: signals.length,
        confirmed: signals.filter((s) => s.status === "confirmed").length,
        proposed: signals.filter((s) => s.status === "proposed").length,
        applications: tasteApps.length,
        applied_by_day: appliedByDay,
        dimensions: sortedRows(dimensionCounts).slice(0, 8),
        top_applied: sortedCopy(
          Object.entries(appliedBySignal).map(([id, value]) => ({
            label: statementById.get(id) ?? "Unknown signal",
            value,
          })),
          (a, b) => b.value - a.value,
        ).slice(0, 5),
      },
    },
  });
}

/* ---------------- edges (item links) ---------------- */

async function handleEdges(request: Request, q: Queries, humanId: string): Promise<Response> {
  const spaceId = spaceIdFor(humanId);
  const owns = (itemId: string) => q.getItem(itemId)?.space_id === spaceId;

  if (request.method === "GET") {
    const itemId = new URL(request.url).searchParams.get("item_id");
    if (!itemId || !owns(itemId)) return badRequest("unknown item");
    const links = q.allEdgesForItem(itemId).filter((e) => owns(e.from_id) && owns(e.to_id)).map((e) => {
      const otherId = e.from_id === itemId ? e.to_id : e.from_id;
      return {
        ...e,
        direction: e.from_id === itemId ? ("out" as const) : ("in" as const),
        other: q.getItem(otherId),
        proposed_by_agent: e.approval_state === "proposed" && e.created_by.startsWith("agent:"),
      };
    });
    return json({ ok: true, links });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as { from_item_id?: string; to_item_id?: string; relationship?: string };
    const from = body.from_item_id ?? "";
    const to = body.to_item_id ?? "";
    if (!owns(from) || !owns(to) || from === to) return badRequest("both items must be yours");
    const relationship = (RELATIONSHIPS as readonly string[]).includes(body.relationship ?? "")
      ? (body.relationship as (typeof RELATIONSHIPS)[number])
      : "related_to";
    const edge = {
      id: crypto.randomUUID(),
      from_id: from,
      to_id: to,
      relationship,
      weight: 1,
      created_by: humanId,
      approval_state: "approved" as const,
      created_at: Date.now(),
    };
    q.insertEdge(edge);
    return json({ ok: true, edge });
  }

  if (request.method === "PATCH") {
    const body = (await request.json()) as { id?: string; approval_state?: "approved" | "rejected" };
    const edge = body.id ? q.getEdge(body.id) : null;
    if (!edge || !owns(edge.from_id) || !owns(edge.to_id)) return badRequest("unknown edge");
    if (body.approval_state !== "approved" && body.approval_state !== "rejected") return badRequest("bad state");
    q.setEdgeApproval(edge.id, body.approval_state);
    return json({ ok: true, edge: q.getEdge(edge.id) });
  }

  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id");
    const edge = id ? q.getEdge(id) : null;
    if (!edge || !owns(edge.from_id) || !owns(edge.to_id)) return badRequest("unknown edge");
    q.deleteEdge(edge.id);
    return json({ ok: true, deleted: edge.id });
  }

  return badRequest("unsupported method");
}

/* ---------------- item notes ---------------- */

async function handleItemNotes(request: Request, q: Queries, humanId: string): Promise<Response> {
  const spaceId = spaceIdFor(humanId);

  if (request.method === "GET") {
    const itemId = new URL(request.url).searchParams.get("item_id");
    if (!itemId || q.getItem(itemId)?.space_id !== spaceId) return badRequest("unknown item");
    return json({ ok: true, notes: q.listItemNotes(itemId) });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as { item_id?: string; body?: string };
    if (!body.item_id || q.getItem(body.item_id)?.space_id !== spaceId) return badRequest("unknown item");
    if (!body.body?.trim()) return badRequest("body required");
    const note = {
      id: crypto.randomUUID(),
      item_id: body.item_id,
      space_id: spaceId,
      author_id: humanId,
      body: body.body.trim().slice(0, 2000),
      created_at: Date.now(),
    };
    q.insertItemNote(note);
    return json({ ok: true, note });
  }

  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id");
    const note = id ? q.getItemNote(id) : null;
    if (!note || note.space_id !== spaceId) return badRequest("unknown note");
    q.deleteItemNote(note.id);
    return json({ ok: true, deleted: note.id });
  }

  return badRequest("unsupported method");
}

/* ---------------- beta quota ---------------- */

/**
 * Check-and-consume `cost` units of a monthly quota metric. Returns a 429
 * Response when the member is over budget; null (and a recorded increment) when
 * the call may proceed. Reads still work at the limit — only metered writes stop.
 */
function meter(q: Queries, humanId: string, metric: QuotaMetric, cost = 1): Response | null {
  const check = consumeQuota(q, humanId, metric, cost);
  return check.ok ? null : json(check, { status: 429 });
}

function handleQuota(q: Queries, humanId: string): Response {
  const period = quotaPeriod();
  const used = q.usageForPeriod(humanId, period);
  const now = new Date();
  const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return json({
    ok: true,
    quota: {
      period,
      resets_at: monthEnd,
      beta: { slot: q.betaSlot(humanId), taken: q.betaMemberCount(), max: BETA_MAX_USERS },
      metrics: QUOTA_METRICS.map((m) => ({ metric: m, used: used[m] ?? 0, limit: QUOTA[m] })),
    },
  });
}

/* ---------------- memory sync ---------------- */

async function handleMemoryStatus(request: Request, q: Queries, humanId: string, env: Env): Promise<Response> {
  const spaceId = spaceIdFor(humanId);
  // key_at_request: is the secret visible to the worker NOW. mirror_enabled
  // (inside status): was it visible when the DO last constructed. A mismatch
  // means the DO booted before the secret was set and needs a restart.
  const keyAtRequest = Boolean(env.SUPERMEMORY_API_KEY?.trim());
  if (request.method === "GET") {
    return json({ ok: true, status: q.memoryStatus(spaceId), key_at_request: keyAtRequest });
  }
  if (request.method === "POST") {
    // Force-queue every not-yet-synced item, then drain inline so the caller
    // sees real progress rather than waiting on the alarm.
    const queued = q.backfillMemoryOutbox(spaceId);
    const index = memoryIndexFor(env);
    let drained: unknown = null;
    if (index) {
      const { report } = await drainSpaceMemory(q, index, [env.SUPERMEMORY_API_KEY ?? ""], async (key) => {
        const obj = await env.BLOBS.get(key);
        return obj?.body ? { body: obj.body, contentType: obj.httpMetadata?.contentType ?? null } : null;
      });
      drained = report;
    }
    return json({ ok: true, queued, drained, key_at_request: keyAtRequest, status: q.memoryStatus(spaceId) });
  }
  return badRequest("GET or POST");
}

/* ---------------- lens ---------------- */

function handleLens(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const url = new URL(request.url);
  const taskId = url.searchParams.get("task_id");
  if (!taskId) return badRequest("task_id required");
  const task = q.getTask(taskId);
  if (!task || task.human_id !== humanId) return badRequest("unknown task");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  return json({
    ok: true,
    lens: {
      accesses: q.recentAccesses(taskId, limit),
      denials: q.recentDenials(taskId, limit),
      audit: q.recentAuditEvents(taskId, limit),
    },
  });
}
