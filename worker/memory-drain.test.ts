import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { drainSpaceMemory, memoryContent } from "./memory-drain";
import type { MemoryIndex } from "./memory-index";

function makeQueries(): { q: Queries; db: Database } {
  const db = new Database(":memory:");
  db.run(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  const sql = {
    exec: (query: string, ...b: unknown[]) => {
      const rows = db.query(query).all(...(b as never[]));
      return { toArray: () => rows };
    },
  } as unknown as ConstructorParameters<typeof Queries>[0];
  const q = new Queries(sql, { mirrorMemory: true });
  migrate(sql);
  return { q, db };
}

function seedItem(q: Queries, id: string): void {
  q.insertSpace({ id: "s", name: "A", owner_id: "u", kind: "personal", created_at: 1 });
  q.insertRegion({ id: "r", space_id: "s", parent_id: null, name: "w", slug: "w", created_at: 1 });
  q.insertItem({
    id, space_id: "s", region_id: "r", owner_id: "u", type: "note", title: `Item ${id}`,
    source_url: null, content_ref: null, semantic_text: "body text", metadata: {},
    authority_class: "human_authored", created_by: "u", created_at: 1, updated_at: 1,
  });
}

const stubIndex = (over: Partial<MemoryIndex> = {}): MemoryIndex => ({
  addText: () => Promise.resolve({ id: "doc_x", status: "queued" }),
  addFile: () => Promise.resolve(null),
  updateDocument: () => Promise.resolve(null),
  getDocument: () => Promise.resolve(null),
  deleteDocument: () => Promise.resolve(true),
  search: () => Promise.resolve(null),
  ...over,
});

test("insertItem with mirrorMemory queues an upsert; a successful drain marks it done", async () => {
  const { q, db } = makeQueries();
  seedItem(q, "i1");

  expect(q.countPendingMemoryOps()).toBe(1);
  const { report, morePending } = await drainSpaceMemory(q, stubIndex(), ["secret"]);
  expect(report).toMatchObject({ claimed: 1, completed: 1, retried: 0, failed: 0 });
  expect(morePending).toBe(false);

  const row = db.query("SELECT status, doc_id FROM memory_outbox").get() as { status: string; doc_id: string };
  expect(row.status).toBe("done");
  expect(row.doc_id).toBe("doc_x");
});

test("a provider that is unavailable (null) keeps the job pending and counts a retry", async () => {
  const { q, db } = makeQueries();
  seedItem(q, "i1");

  const { report } = await drainSpaceMemory(q, stubIndex({ addText: () => Promise.resolve(null) }), ["s"]);
  expect(report).toMatchObject({ retried: 1, completed: 0 });
  const row = db.query("SELECT status, attempts FROM memory_outbox").get() as { status: string; attempts: number };
  expect(row.status).toBe("pending");
  expect(row.attempts).toBe(1);
});

test("a job is parked as failed after the attempt ceiling", async () => {
  const { q, db } = makeQueries();
  seedItem(q, "i1");
  const down = stubIndex({ addText: () => Promise.resolve(null) });
  for (let i = 0; i < 5; i++) await drainSpaceMemory(q, down, ["s"]);
  const row = db.query("SELECT status, attempts FROM memory_outbox").get() as { status: string; attempts: number };
  expect(row.status).toBe("failed");
  expect(row.attempts).toBe(5);
  expect(q.countPendingMemoryOps()).toBe(0);
});

test("deleteItem queues a delete op that the drain sends on", async () => {
  const { q, db } = makeQueries();
  seedItem(q, "i1");
  await drainSpaceMemory(q, stubIndex(), ["s"]); // clear the initial upsert

  let deletedId: string | null = null;
  q.deleteItem("i1");
  const { report } = await drainSpaceMemory(
    q,
    stubIndex({ deleteDocument: (id) => { deletedId = id; return Promise.resolve(true); } }),
    ["s"],
  );
  expect(report).toMatchObject({ completed: 1 });
  expect(deletedId).toBe("i1");
  const statuses = db.query("SELECT op, status FROM memory_outbox ORDER BY op").all() as { op: string; status: string }[];
  expect(statuses).toEqual([{ op: "delete", status: "done" }, { op: "upsert", status: "done" }]);
});

test("memoryContent joins title and body, trims when body is absent", () => {
  expect(memoryContent({ title: "T", semantic_text: "B", region_id: "r", authority_class: "human_authored" })).toBe("T\nB");
  expect(memoryContent({ title: "T", semantic_text: null, region_id: "r", authority_class: "human_authored" })).toBe("T");
});
