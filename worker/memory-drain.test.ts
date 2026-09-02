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

test("a file-backed item sends its bytes via addFile, with title/desc as context", async () => {
  const { q } = makeQueries();
  q.insertSpace({ id: "s", name: "A", owner_id: "u", kind: "personal", created_at: 1 });
  q.insertRegion({ id: "r", space_id: "s", parent_id: null, name: "w", slug: "w", created_at: 1 });
  q.insertItem({
    id: "img1", space_id: "s", region_id: "r", owner_id: "u", type: "image", title: "Palette shot",
    source_url: null, content_ref: "space-s/abc", semantic_text: "warm terracotta swatches", metadata: {},
    authority_class: "human_authored", created_by: "u", created_at: 1, updated_at: 1,
  });

  let addFileArg: Record<string, unknown> | null = null;
  let addTextCalled = false;
  const index = stubIndex({
    addFile: (input) => { addFileArg = input as Record<string, unknown>; return Promise.resolve({ id: "file_doc", status: "queued" }); },
    addText: () => { addTextCalled = true; return Promise.resolve(null); },
  });
  const { report } = await drainSpaceMemory(q, index, ["s"], () =>
    Promise.resolve({ body: new Response("PNGBYTES").body!, contentType: "image/png" }),
  );
  expect(report).toMatchObject({ completed: 1 });
  expect(addTextCalled).toBe(false);
  expect(addFileArg).toMatchObject({
    customId: "img1",
    containerTag: "s",
    fileType: "image",
    mimeType: "image/png",
    entityContext: "Palette shot\nwarm terracotta swatches",
  });
});

test("a file-backed item falls back to text when the blob can't be fetched", async () => {
  const { q } = makeQueries();
  q.insertSpace({ id: "s", name: "A", owner_id: "u", kind: "personal", created_at: 1 });
  q.insertRegion({ id: "r", space_id: "s", parent_id: null, name: "w", slug: "w", created_at: 1 });
  q.insertItem({
    id: "img2", space_id: "s", region_id: "r", owner_id: "u", type: "image", title: "Lost blob",
    source_url: null, content_ref: "space-s/gone", semantic_text: "desc", metadata: {},
    authority_class: "human_authored", created_by: "u", created_at: 1, updated_at: 1,
  });
  let addTextArg: Record<string, unknown> | null = null;
  const index = stubIndex({ addText: (i) => { addTextArg = i as Record<string, unknown>; return Promise.resolve({ id: "t", status: "queued" }); } });

  const { report } = await drainSpaceMemory(q, index, ["s"], () => Promise.resolve(null));
  expect(report).toMatchObject({ completed: 1 });
  expect(addTextArg).toMatchObject({ customId: "img2", content: "Lost blob\ndesc" });
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

test("backfillMemoryOutbox queues only items that never synced", async () => {
  const { q, db } = makeQueries();
  seedItem(q, "i1"); // insertItem already queued an upsert for i1
  q.insertItem({
    id: "i2", space_id: "s", region_id: "r", owner_id: "u", type: "note", title: "Item i2",
    source_url: null, content_ref: null, semantic_text: "body", metadata: {},
    authority_class: "human_authored", created_by: "u", created_at: 1, updated_at: 1,
  });
  await drainSpaceMemory(q, stubIndex(), ["s"]); // i1 + i2 both -> done

  // simulate an old item with no outbox history at all
  db.run(
    `INSERT INTO items (id, space_id, region_id, owner_id, type, title, source_url, content_ref, semantic_text, metadata, authority_class, created_by, created_at, updated_at)
     VALUES ('old', 's', 'r', 'u', 'note', 'Old item', NULL, NULL, 'never synced', '{}', 'human_authored', 'u', 1, 1)`,
  );
  // and one whose only history is a failed attempt
  db.run(
    `INSERT INTO items (id, space_id, region_id, owner_id, type, title, source_url, content_ref, semantic_text, metadata, authority_class, created_by, created_at, updated_at)
     VALUES ('flaky', 's', 'r', 'u', 'note', 'Flaky item', NULL, NULL, 'text', '{}', 'human_authored', 'u', 1, 1)`,
  );
  db.run(
    `INSERT INTO memory_outbox (id, space_id, op, item_id, custom_id, container_tag, payload, status, attempts, created_at, updated_at)
     VALUES ('j', 's', 'upsert', 'flaky', 'flaky', 's', '{}', 'failed', 5, 1, 1)`,
  );

  const queued = q.backfillMemoryOutbox("s");
  expect(queued).toBe(2); // 'old' and 'flaky', not i1 / i2 (already done)
  const pendingIds = (db.query("SELECT item_id FROM memory_outbox WHERE status = 'pending'").all() as { item_id: string }[])
    .map((r) => r.item_id)
    .toSorted();
  expect(pendingIds).toEqual(["flaky", "old"]);
});

test("memoryContent joins title and body, trims when body is absent", () => {
  expect(memoryContent({ title: "T", semantic_text: "B", region_id: "r", authority_class: "human_authored" })).toBe("T\nB");
  expect(memoryContent({ title: "T", semantic_text: null, region_id: "r", authority_class: "human_authored" })).toBe("T");
});
