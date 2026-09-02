/**
 * content_url (signed, ~15min, for an agent's own independent fetch) only on
 * a deliberate single-item look; embed_url (plain, permanent /api/blob path,
 * for dropping into content_html the agent is authoring) everywhere a
 * viewable item appears — cheap, no signing, no expiry to go stale in saved
 * artifact HTML.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { handleToolCall } from "./mcp";
import type { ToolCallRequest } from "@shared/contract";

function makeQueries(): Queries {
  const db = new Database(":memory:");
  db.run(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  const sql = {
    exec: (query: string, ...b: unknown[]) => {
      const rows = db.query(query).all(...(b as never[]));
      return { toArray: () => rows };
    },
  } as unknown as ConstructorParameters<typeof Queries>[0];
  const q = new Queries(sql);
  migrate(sql);
  return q;
}

const HUMAN = "u1";
const SPACE = "s1";
const now = 1_000_000;
const ENV = { BLOB_SIGNING_SECRET: "test-secret" } as unknown as Env;
const ORIGIN = "https://app.example";

function seed(q: Queries) {
  q.insertSpace({ id: SPACE, name: "Archive", owner_id: HUMAN, kind: "personal", created_at: now });
  q.insertRegion({ id: "r_a", space_id: SPACE, parent_id: null, name: "Assets", slug: "assets", created_at: now });
  q.insertItem({
    id: "img1", space_id: SPACE, region_id: "r_a", owner_id: HUMAN, type: "image", title: "Logo",
    source_url: null, content_ref: `${SPACE}/logo.png`, semantic_text: "company logo, red on white", metadata: {},
    authority_class: "human_authored", created_by: HUMAN, created_at: now, updated_at: now,
  });
  q.insertItem({
    id: "note1", space_id: SPACE, region_id: "r_a", owner_id: HUMAN, type: "note", title: "Plain note",
    source_url: null, content_ref: null, semantic_text: "just text", metadata: {},
    authority_class: "human_authored", created_by: HUMAN, created_at: now, updated_at: now,
  });
  q.insertTask({ id: "t1", space_id: SPACE, human_id: HUMAN, title: "Task", instruction: "", status: "open", created_at: now, expires_at: null });
  q.insertGrant({
    id: "g_r_a", task_id: "t1", space_id: SPACE, region_id: "r_a", level: "read",
    grantor_id: HUMAN, created_at: now, expires_at: null, revoked_at: null, revoked_by: null, reason: null,
  });
  q.insertAgentSession({ id: "sess1", human_id: HUMAN, task_id: "t1", declared: null, created_at: now });
}

const call = (q: Queries, tool: ToolCallRequest["tool"], input: Record<string, unknown>) =>
  handleToolCall({ tool, input, agent_session_id: "sess1", task_id: "t1" }, q, { human_id: HUMAN }, now + 1, ENV, ORIGIN);

test("inspect_context_item (a deliberate look) returns both content_url and embed_url for an image", async () => {
  const q = makeQueries();
  seed(q);
  const res = await call(q, "inspect_context_item", { region: "assets", item_id: "img1" });
  expect(res.ok).toBe(true);
  const item = (res as { result: { item: { content_url: string | null; embed_url: string | null } } }).result.item;
  expect(item.content_url).toContain("sig=");
  expect(item.embed_url).toBe(`/api/blob?key=${encodeURIComponent(`${SPACE}/logo.png`)}`);
});

test("get_context_for_task (a listing) returns embed_url but never the signed content_url", async () => {
  const q = makeQueries();
  seed(q);
  const res = await call(q, "get_context_for_task", { region: "assets", query: "logo" });
  expect(res.ok).toBe(true);
  const items = (res as { result: { items: { id: string; embed_url: string | null; content_url?: unknown }[] } }).result.items;
  const logo = items.find((i) => i.id === "img1");
  expect(logo?.embed_url).toBe(`/api/blob?key=${encodeURIComponent(`${SPACE}/logo.png`)}`);
  expect(logo).not.toHaveProperty("content_url");
});

test("a non-viewable item (a plain note) gets neither url field", async () => {
  const q = makeQueries();
  seed(q);
  const res = await call(q, "inspect_context_item", { region: "assets", item_id: "note1" });
  const item = (res as { result: { item: { content_url: string | null; embed_url: string | null } } }).result.item;
  expect(item.content_url).toBeNull();
  expect(item.embed_url).toBeNull();
});
