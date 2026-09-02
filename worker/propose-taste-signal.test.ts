/**
 * propose_taste_signal: an agent can name a pattern it noticed in the
 * person's own feedback, but only grounded in evidence it can actually
 * reach, and it always lands as "proposed" — never auto-confirmed.
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

async function withAnnotation(q: Queries) {
  const rec = await call(q, "record_artifact", { region: "folder-a", title: "Brief", content_html: "<p>v1</p>" });
  const { version_id } = (rec as { result: { version_id: string } }).result;
  const annotationId = crypto.randomUUID();
  q.insertAnnotation({
    id: annotationId, version_id, author_id: HUMAN, target: null,
    sentiment: "negative", dimensions: [], comment: "too centered", status: "open", created_at: now,
  });
  return annotationId;
}

test("a proposal grounded in a real annotation lands as proposed, never confirmed", async () => {
  const q = makeQueries();
  seed(q);
  const annotationId = await withAnnotation(q);

  const res = await call(q, "propose_taste_signal", {
    region: "folder-a",
    statement: "prefers left-aligned layouts over centered",
    annotation_ids: [annotationId],
  });
  expect(res.ok).toBe(true);
  const { signal_id } = (res as { result: { signal_id: string } }).result;
  const signal = q.getTasteSignal(signal_id);
  expect(signal?.status).toBe("proposed");
  // "agent", not "system": the derivation loop reading the person's own
  // annotations and an agent naming a pattern it noticed are different acts,
  // and the Taste UI attributes them differently. Both stay `proposed`.
  expect(signal?.created_by).toBe("agent");
  expect(q.listTasteEvidence(signal_id)).toHaveLength(1);
});

test("a proposal with no reachable evidence is denied", async () => {
  const q = makeQueries();
  seed(q);
  const res = await call(q, "propose_taste_signal", {
    region: "folder-a",
    statement: "prefers left-aligned layouts",
    annotation_ids: ["not-a-real-annotation"],
  });
  expect(res.ok).toBe(false);
});

test("an annotation from another task cannot be cited as evidence", async () => {
  const q = makeQueries();
  seed(q);
  q.insertTask({ id: "t2", space_id: SPACE, human_id: HUMAN, title: "Other", instruction: "", status: "open", created_at: now, expires_at: null });
  q.insertGrant({
    id: "g_r_a_t2", task_id: "t2", space_id: SPACE, region_id: "r_a", level: "write",
    grantor_id: HUMAN, created_at: now, expires_at: null, revoked_at: null, revoked_by: null, reason: null,
  });
  q.insertAgentSession({ id: "sess2", human_id: HUMAN, task_id: "t2", declared: null, created_at: now });
  const rec = await handleToolCall(
    { tool: "record_artifact", input: { region: "folder-a", title: "Brief", content_html: "<p>v1</p>" }, agent_session_id: "sess2", task_id: "t2" },
    q, { human_id: HUMAN }, now + 1,
  );
  const { version_id } = (rec as { result: { version_id: string } }).result;
  const foreignAnnotationId = crypto.randomUUID();
  q.insertAnnotation({
    id: foreignAnnotationId, version_id, author_id: HUMAN, target: null,
    sentiment: "negative", dimensions: [], comment: "n/a", status: "open", created_at: now,
  });

  const res = await call(q, "propose_taste_signal", {
    region: "folder-a",
    statement: "prefers left-aligned layouts",
    annotation_ids: [foreignAnnotationId],
  });
  expect(res.ok).toBe(false);
});
