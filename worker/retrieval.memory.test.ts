/**
 * Supermemory augments retrieval as candidate list D. These tests pin the two
 * things that matter: it can surface an item FTS would miss, and it can NEVER
 * surface an item the caller is not permitted to see — a stale or forbidden hit
 * is dropped by the same permission filter every other list goes through.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { retrieve } from "./retrieval";
import type { MemoryIndex, MemorySearchResult } from "./memory-index";

const HUMAN = "user_1";
const SPACE = "space-user_1";
const now = 1_000_000;

function makeQueries(): Queries {
  const db = new Database(":memory:");
  db.run(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  const sql = {
    exec: (query: string, ...bindings: unknown[]) => {
      const rows = db.query(query).all(...(bindings as never[]));
      return { toArray: () => rows };
    },
  } as unknown as ConstructorParameters<typeof Queries>[0];
  const q = new Queries(sql);
  migrate(sql);
  return q;
}

function seed(q: Queries): void {
  q.insertSpace({ id: SPACE, name: "Archive", owner_id: HUMAN, kind: "personal", created_at: now });
  for (const [id, slug] of [["r_work", "work"], ["r_pers", "personal"]] as const) {
    q.insertRegion({ id, space_id: SPACE, parent_id: null, name: slug, slug, created_at: now });
  }
  const item = (id: string, region_id: string, title: string, text: string) =>
    q.insertItem({
      id, space_id: SPACE, region_id, owner_id: HUMAN, type: "note", title,
      source_url: null, content_ref: null, semantic_text: text, metadata: {},
      authority_class: "human_authored", created_by: HUMAN, created_at: now, updated_at: now,
    });
  // Title/text share no words with the query "earthy muted tones" — FTS misses it.
  item("i_palette", "r_work", "Terracotta reference", "burnt sienna and clay ceramic swatches");
  item("i_secret", "r_pers", "Salary notes", "confidential compensation figures");

  q.insertTask({
    id: "t1", space_id: SPACE, human_id: HUMAN, title: "Task", instruction: "",
    status: "open", created_at: now, expires_at: null,
  });
  q.insertGrant({
    id: "g_work", task_id: "t1", space_id: SPACE, region_id: "r_work", level: "read",
    grantor_id: HUMAN, created_at: now, expires_at: null, revoked_at: null, revoked_by: null, reason: null,
  });
  // r_pers: deliberately ungranted.
}

function fakeMemory(itemIds: string[]): MemoryIndex {
  const result: MemorySearchResult = {
    timingMs: 5,
    total: itemIds.length,
    hits: itemIds.map((item_id, i) => ({
      id: `chunk_${i}`,
      documentId: `doc_${i}`,
      content: "match",
      position: null,
      similarity: 0.9 - i * 0.01,
      filepath: null,
      document: {
        id: `doc_${i}`, createdAt: null, updatedAt: null, title: null, type: "text",
        metadata: { item_id }, summary: null,
      },
    })),
  };
  return {
    addText: () => Promise.resolve(null),
    addFile: () => Promise.resolve(null),
    updateDocument: () => Promise.resolve(null),
    getDocument: () => Promise.resolve(null),
    deleteDocument: () => Promise.resolve(true),
    search: () => Promise.resolve(result),
  };
}

test("a semantic hit feeds RRF as candidate list D and is named in why()", async () => {
  const q = makeQueries();
  seed(q);
  // A query that shares no words with any item — FTS contributes nothing, so the
  // only thing that can rank i_palette by relevance is the semantic list.
  const input = { taskId: "t1", query: "earthy muted tones", regionSlugs: null, limit: 10 };

  const withoutMemory = await retrieve(q, input, now + 1);
  expect(withoutMemory.every((r) => r.signals.ranks.semantic === null)).toBe(true);
  expect(withoutMemory.find((r) => r.item.id === "i_palette")?.signals.ranks.fts ?? null).toBeNull();

  const withMemory = await retrieve(q, input, now + 1, fakeMemory(["i_palette"]));
  const hit = withMemory.find((r) => r.item.id === "i_palette");
  expect(hit?.signals.ranks.semantic).toBe(1);
  expect(hit?.why).toContain("semantic match");
});

test("a semantic hit for an ungranted region is dropped", async () => {
  const q = makeQueries();
  seed(q);
  // Supermemory returns the forbidden item first; the permission filter must eat it.
  const out = await retrieve(
    q,
    { taskId: "t1", query: "compensation", regionSlugs: null, limit: 10 },
    now + 1,
    fakeMemory(["i_secret", "i_palette"]),
  );
  expect(out.map((r) => r.item.id)).not.toContain("i_secret");
});

test("a semantic hit for an unknown / stale item id is ignored, not fatal", async () => {
  const q = makeQueries();
  seed(q);
  const out = await retrieve(
    q,
    { taskId: "t1", query: "clay", regionSlugs: null, limit: 10 },
    now + 1,
    fakeMemory(["i_deleted_last_week", "i_palette"]),
  );
  expect(out.map((r) => r.item.id)).toContain("i_palette");
});

test("retrieval still returns SQLite results when the memory call rejects", async () => {
  const q = makeQueries();
  seed(q);
  const flaky: MemoryIndex = { ...fakeMemory([]), search: () => Promise.reject(new Error("down")) };
  const out = await retrieve(
    q,
    { taskId: "t1", query: "terracotta", regionSlugs: null, limit: 10 },
    now + 1,
    flaky,
  );
  expect(out.map((r) => r.item.id)).toContain("i_palette");
  expect(out.every((r) => r.signals.ranks.semantic === null)).toBe(true);
});
