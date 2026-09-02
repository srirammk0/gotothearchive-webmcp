import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { ContextItem } from "@shared/contract";
import { handleToolCall, clampRetrievalLimit } from "./mcp";
import { authorize, liveGrants } from "./permissions";
import { extractUrl, isPublicHttpUrl } from "./extract";
import { detectSafeUploadMime } from "./routes";
import { rebuildFts } from "./db/migrate";
import { Queries } from "./db/queries";
import { rebuildSpaceEdges } from "./graph-build";

function makeQueries(): { q: Queries; sql: SqlStorage; db: Database } {
  const db = new Database(":memory:");
  db.run(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  const sql = {
    exec: (query: string, ...bindings: unknown[]) => {
      const rows = db.query(query).all(...(bindings as never[]));
      return { toArray: () => rows };
    },
  } as unknown as SqlStorage;
  return { q: new Queries(sql), sql, db };
}

function base(q: Queries, taskExpiresAt: number | null = null): void {
  q.insertSpace({ id: "space-u1", name: "Archive", owner_id: "u1", kind: "personal", created_at: 1 });
  q.insertRegion({ id: "r1", space_id: "space-u1", parent_id: null, name: "Work", slug: "work", created_at: 1 });
  q.insertRegion({ id: "r2", space_id: "space-u1", parent_id: null, name: "Private", slug: "private", created_at: 1 });
  q.insertTask({
    id: "task1",
    space_id: "space-u1",
    human_id: "u1",
    title: "Task",
    instruction: "",
    status: "open",
    created_at: 1,
    expires_at: taskExpiresAt,
  });
  q.insertGrant({
    id: "grant1",
    task_id: "task1",
    space_id: "space-u1",
    region_id: "r1",
    level: "read",
    grantor_id: "u1",
    created_at: 1,
    expires_at: null,
    revoked_at: null,
    revoked_by: null,
    reason: null,
  });
  q.insertAgentSession({ id: "session1", human_id: "u1", task_id: "task1", declared: null, created_at: 1 });
}

function item(id: string, regionId: string, title: string): ContextItem {
  return {
    id,
    space_id: "space-u1",
    region_id: regionId,
    owner_id: "u1",
    type: "note",
    title,
    source_url: null,
    content_ref: null,
    semantic_text: title,
    metadata: {},
    authority_class: "human_authored",
    created_by: "u1",
    created_at: 1,
    updated_at: 1,
  };
}

const call = (q: Queries, input: Record<string, unknown>) =>
  handleToolCall(
    { tool: "get_current_context_scope", input, agent_session_id: "session1", task_id: "task1" },
    q,
    { human_id: "u1" },
    100,
  );

test("task expiry is enforced by both live grants and authorization", () => {
  const { q } = makeQueries();
  base(q, 100);
  expect(liveGrants(q, "task1", 100)).toEqual([]);
  const result = authorize(q, {
    taskId: "task1",
    agentSessionId: "session1",
    regionSlug: "work",
    need: "read",
    toolName: "get_context_for_task",
    requested: {},
  }, 100);
  expect(result).toMatchObject({ ok: false });
});

test("context scope uses the same live grant set as authorization", async () => {
  const { q } = makeQueries();
  base(q, 1_000);
  const result = await call(q, {});
  expect(result).toMatchObject({ ok: true, result: { regions: [{ slug: "work", level: "read" }] } });
});

test("artifact trace resolves artifact_id to its latest version and its influences", async () => {
  const { q } = makeQueries();
  base(q, 1_000);
  q.insertItem(item("item1", "r1", "Reference"));
  q.insertArtifact({ id: "artifact1", space_id: "space-u1", task_id: "task1", kind: "visual_brief", title: "Brief", created_at: 1 });
  q.insertArtifactVersion({ id: "version1", artifact_id: "artifact1", version_no: 1, parent_version_id: null, content_html: "<p>x</p>", agent_session_id: "session1", state: "ready_for_review", created_at: 1 });
  q.insertInfluence({ id: "influence1", version_id: "version1", item_id: "item1", role: "reference", strength: 1, note: null });
  const result = await handleToolCall(
    { tool: "trace_artifact_influences", input: { artifact_id: "artifact1" }, agent_session_id: "session1", task_id: "task1" },
    q,
    { human_id: "u1" },
    100,
  );
  expect(result).toMatchObject({ ok: true, result: { version: { id: "version1" }, influences: [{ influence: { id: "influence1" } }] } });
});

test("artifact revisions must name the current latest version as parent", async () => {
  const { q } = makeQueries();
  base(q, 1_000);
  q.revokeGrant("grant1", "u1", "test upgrade", 2);
  q.insertGrant({ id: "grant2", task_id: "task1", space_id: "space-u1", region_id: "r1", level: "propose", grantor_id: "u1", created_at: 2, expires_at: null, revoked_at: null, revoked_by: null, reason: null });
  const first = await handleToolCall(
    { tool: "record_artifact", input: { region: "work", title: "Brief", content_html: "<p>one</p>" }, agent_session_id: "session1", task_id: "task1" },
    q,
    { human_id: "u1" },
    100,
  );
  const firstResult = (first as { result: { artifact_id: string; version_id: string } }).result;
  const second = await handleToolCall(
    { tool: "record_artifact", input: { region: "work", title: "Brief", content_html: "<p>two</p>", artifact_id: firstResult.artifact_id, parent_version_id: firstResult.version_id }, agent_session_id: "session1", task_id: "task1" },
    q,
    { human_id: "u1" },
    101,
  );
  expect(second.ok).toBe(true);
  const stale = await handleToolCall(
    { tool: "record_artifact", input: { region: "work", title: "Brief", content_html: "<p>stale</p>", artifact_id: firstResult.artifact_id, parent_version_id: firstResult.version_id }, agent_session_id: "session1", task_id: "task1" },
    q,
    { human_id: "u1" },
    102,
  );
  expect(stale).toMatchObject({ ok: false, reason: "parent_version_id must be an existing version of the same artifact" });
});

test("retrieval limits are finite, integral, and capped", () => {
  expect(clampRetrievalLimit(-4)).toBe(1);
  expect(clampRetrievalLimit(3.9)).toBe(3);
  expect(clampRetrievalLimit(999)).toBe(20);
  expect(clampRetrievalLimit(Number.NaN)).toBe(10);
  expect(clampRetrievalLimit(Number.POSITIVE_INFINITY)).toBe(10);
});

test("edge insertion rejects cross-space endpoints", () => {
  const { q } = makeQueries();
  base(q);
  q.insertItem(item("item1", "r1", "One"));
  expect(() => q.insertEdge({ id: "edge1", from_id: "item1", to_id: "foreign", relationship: "related_to", weight: 1, created_by: "u1", approval_state: "approved", created_at: 1 })).toThrow();
});

test("versioned graph backfill marker preserves human-created edges", () => {
  const { q } = makeQueries();
  base(q);
  q.insertItem(item("item1", "r1", "One"));
  q.insertItem(item("item2", "r1", "Two"));
  q.insertEdge({ id: "human-edge", from_id: "item1", to_id: "item2", relationship: "related_to", weight: 1, created_by: "u1", approval_state: "approved", created_at: 1 });
  expect(rebuildSpaceEdges(q, "space-u1", 2)).toBe(0);
  q.recordGraphBackfill("space-u1", 1, 2);
  expect(q.graphBackfillVersion("space-u1")).toBe(1);
  expect(q.getEdge("human-edge")?.created_by).toBe("u1");
});

test("FTS rebuild is canonical and title-based data is not purged", () => {
  const { q, sql, db } = makeQueries();
  base(q);
  q.insertItem(item("item1", "r1", "Atlas rebrand — creative brief"));
  q.insertItem(item("item2", "r1", "Terracotta palette reference"));
  rebuildFts(sql);
  expect(q.listItemsBySpace("space-u1")).toHaveLength(2);
  expect(q.searchItems("Atlas", ["r1"], 5).map((found) => found.id)).toEqual(["item1"]);
  db.close();
});

test("public-host validation blocks private and non-http URLs", () => {
  expect(isPublicHttpUrl("https://archive.openai.com/work")).toBe(true);
  expect(isPublicHttpUrl("http://127.0.0.1/admin")).toBe(false);
  expect(isPublicHttpUrl("http://[::1]/admin")).toBe(false);
  expect(isPublicHttpUrl("http://10.0.0.1/secret")).toBe(false);
  expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
});

test("manual extraction follows at most three public redirects", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    calls++;
    const path = new URL(String(input)).pathname;
    if (path !== "/final") {
      return new Response(null, { status: 302, headers: { location: calls === 3 ? "/final" : `/hop${calls}` } });
    }
    return new Response("<title>Final</title>", { status: 200, headers: { "content-type": "text/html" } });
  };
  const result = await extractUrl("https://archive.openai.com/start", fetchImpl);
  expect(result?.title).toBe("Final");
  expect(calls).toBe(4);
});

test("redirecting extraction refuses a private destination", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
  };
  expect(await extractUrl("https://archive.openai.com/start", fetchImpl)).toBeNull();
  expect(calls).toBe(1);
});

test("uploads require matching safe MIME signatures", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7").buffer;
  expect(detectSafeUploadMime("application/pdf; charset=binary", pdf)).toBe("application/pdf");
  expect(detectSafeUploadMime("image/png", pdf)).toBeNull();
  expect(detectSafeUploadMime("text/html", new TextEncoder().encode("<script>alert(1)</script>").buffer)).toBeNull();
  expect(detectSafeUploadMime("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer)).toBe("image/png");
});
