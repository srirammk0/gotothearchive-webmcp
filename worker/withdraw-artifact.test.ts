/**
 * withdraw_artifact: an agent can take back its OWN unreviewed output, and
 * nothing else. The guards are the feature — without them this is a tool for
 * deleting the human's context, which is the one thing this product exists to
 * prevent.
 *
 * Also pins the quota rule: an artifact costs one unit however many times it is
 * revised, and withdrawing it gives that unit back.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { handleToolCall } from "./mcp";
import { quotaPeriod } from "./quota";
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
// A real timestamp, not an epoch-ish fixture: quota counters are bucketed by
// calendar month, so an artifact dated 1970 is outside the live period and
// (correctly) not refundable. The production case is always "created seconds
// ago", which is what this reproduces.
const now = Date.now();

function seed(q: Queries) {
  q.insertSpace({ id: SPACE, name: "Archive", owner_id: HUMAN, kind: "personal", created_at: now });
  q.insertRegion({ id: "r_a", space_id: SPACE, parent_id: null, name: "Folder A", slug: "folder-a", created_at: now });
  q.insertTask({ id: "t1", space_id: SPACE, human_id: HUMAN, title: "Task", instruction: "", status: "open", created_at: now, expires_at: null });
  q.insertGrant({
    id: "g_r_a", task_id: "t1", space_id: SPACE, region_id: "r_a", level: "write",
    grantor_id: HUMAN, created_at: now, expires_at: null, revoked_at: null, revoked_by: null, reason: null,
  });
  q.insertAgentSession({ id: "sess1", human_id: HUMAN, task_id: "t1", declared: null, created_at: now });
}

const call = (q: Queries, tool: ToolCallRequest["tool"], input: Record<string, unknown>) =>
  handleToolCall({ tool, input, agent_session_id: "sess1", task_id: "t1" }, q, { human_id: HUMAN }, now + 1);

async function record(q: Queries, extra: Record<string, unknown> = {}) {
  const res = await call(q, "record_artifact", {
    region: "folder-a",
    title: "Poster",
    content_html: "<p>v1</p>",
    ...extra,
  });
  return (res as { ok: boolean; result: { artifact_id: string; version_id: string } }).result;
}

// consumeQuota() keys the counter off the real wall clock, not the tool's
// `now`, so the test must read the same live period rather than 1970.
const used = (q: Queries) => q.usageGet(HUMAN, quotaPeriod(), "artifacts");

test("an artifact costs one quota unit however many times it is revised", async () => {
  const q = makeQueries();
  seed(q);
  const first = await record(q);
  expect(used(q)).toBe(1);

  // Two revisions of the SAME artifact. Revising is the core review loop, so
  // charging per version metered exactly the behaviour the product wants.
  const second = await record(q, { artifact_id: first.artifact_id, parent_version_id: first.version_id });
  const third = await record(q, { artifact_id: first.artifact_id, parent_version_id: second.version_id });
  expect(third.artifact_id).toBe(first.artifact_id);
  expect(used(q)).toBe(1);

  // A genuinely new artifact does cost another unit.
  await record(q, { title: "Second poster" });
  expect(used(q)).toBe(2);
});

test("an agent can withdraw its own unreviewed artifact, and gets the unit back", async () => {
  const q = makeQueries();
  seed(q);
  const { artifact_id } = await record(q);
  expect(used(q)).toBe(1);

  const res = (await call(q, "withdraw_artifact", { artifact_id })) as { ok: boolean; result: { withdrawn: string } };
  expect(res.ok).toBe(true);
  expect(res.result.withdrawn).toBe(artifact_id);
  expect(q.getArtifact(artifact_id)).toBeNull();
  expect(used(q)).toBe(0);
});

test("withdrawal is refused once a person has annotated it", async () => {
  const q = makeQueries();
  seed(q);
  const { artifact_id, version_id } = await record(q);
  q.insertAnnotation({
    id: crypto.randomUUID(), version_id, author_id: HUMAN, target: null,
    sentiment: "negative", dimensions: [], comment: "too centered", status: "open", created_at: now,
  });

  const res = (await call(q, "withdraw_artifact", { artifact_id })) as { ok: boolean; reason: string };
  expect(res.ok).toBe(false);
  // The person's feedback is the thing being protected here.
  expect(res.reason).toContain("destroy their feedback");
  expect(q.getArtifact(artifact_id)).not.toBeNull();
});

test("an agent's OWN annotation does not block its withdrawal", async () => {
  const q = makeQueries();
  seed(q);
  const { artifact_id, version_id } = await record(q);
  q.insertAnnotation({
    id: crypto.randomUUID(), version_id, author_id: "agent:sess1", target: null,
    sentiment: "neutral", dimensions: [], comment: "self note", status: "open", created_at: now,
  });
  expect(((await call(q, "withdraw_artifact", { artifact_id })) as { ok: boolean }).ok).toBe(true);
});

test("withdrawal is refused once the artifact has been decided on", async () => {
  const q = makeQueries();
  seed(q);
  const { artifact_id, version_id } = await record(q);
  // A review decision moves the version out of ready_for_review.
  const version = q.getArtifactVersion(version_id)!;
  q.setArtifactVersionState(version.id, "approved");

  const res = (await call(q, "withdraw_artifact", { artifact_id })) as { ok: boolean };
  expect(res.ok).toBe(false);
  expect(q.getArtifact(artifact_id)).not.toBeNull();
});

test("an artifact from another task cannot be withdrawn", async () => {
  const q = makeQueries();
  seed(q);
  const { artifact_id } = await record(q);
  // Re-file it under a task this session has nothing to do with.
  q.insertTask({ id: "t2", space_id: SPACE, human_id: HUMAN, title: "Other", instruction: "", status: "open", created_at: now, expires_at: null });
  const artifact = q.getArtifact(artifact_id)!;
  q.insertArtifact({ ...artifact, id: "a_other", task_id: "t2" });

  const res = (await call(q, "withdraw_artifact", { artifact_id: "a_other" })) as { ok: boolean };
  expect(res.ok).toBe(false);
  expect(q.getArtifact("a_other")).not.toBeNull();
});

test("an unknown artifact id is refused, not silently ignored", async () => {
  const q = makeQueries();
  seed(q);
  const res = (await call(q, "withdraw_artifact", { artifact_id: "nope" })) as { ok: boolean; reason: string };
  expect(res.ok).toBe(false);
  expect(res.reason).toContain("does not exist");
});

/* ---------------- remove_context_item ---------------- */

test("an agent can remove an item it filed itself", async () => {
  const q = makeQueries();
  seed(q);
  const added = (await call(q, "add_context_item", {
    region: "folder-a", type: "note", title: "Scratch", body: "temp",
  })) as { ok: boolean; result: { item_id: string } };
  expect(added.ok).toBe(true);

  const res = (await call(q, "remove_context_item", { item_id: added.result.item_id })) as { ok: boolean };
  expect(res.ok).toBe(true);
  expect(q.getItem(added.result.item_id)).toBeNull();
});

test("a human-authored item cannot be removed, even at write access", async () => {
  const q = makeQueries();
  seed(q);
  // The grant in seed() is "write" — the highest tier — so this proves the
  // refusal comes from authorship, not from the permission level.
  const id = crypto.randomUUID();
  q.insertItem({
    id, space_id: SPACE, region_id: "r_a", owner_id: HUMAN, type: "note",
    title: "My own note", source_url: null, content_ref: null, semantic_text: "mine",
    metadata: {}, authority_class: "human_authored", created_by: HUMAN,
    created_at: now, updated_at: now,
  });

  const res = (await call(q, "remove_context_item", { item_id: id })) as { ok: boolean; reason: string };
  expect(res.ok).toBe(false);
  expect(res.reason).toContain("theirs to delete");
  expect(q.getItem(id)).not.toBeNull();
});

test("an item filed by a different person's agent cannot be removed", async () => {
  const q = makeQueries();
  seed(q);
  q.insertAgentSession({ id: "sess_other", human_id: "u2", task_id: "t1", declared: null, created_at: now });
  const id = crypto.randomUUID();
  q.insertItem({
    id, space_id: SPACE, region_id: "r_a", owner_id: HUMAN, type: "note",
    title: "Not yours", source_url: null, content_ref: null, semantic_text: null,
    metadata: {}, authority_class: "agent_authored", created_by: "agent:sess_other",
    created_at: now, updated_at: now,
  });

  expect(((await call(q, "remove_context_item", { item_id: id })) as { ok: boolean }).ok).toBe(false);
  expect(q.getItem(id)).not.toBeNull();
});
