/**
 * End-to-end: the whole collaboration loop against a real SQLite schema.
 *
 *   archive context → retrieve (scoped) → record artifact → annotate with
 *   sentiment + dimension → request changes → taste proposed from the notes →
 *   confirm it → retrieve again (taste now applies) → submit a child revision.
 *
 * No Durable Object — an in-memory `bun:sqlite` DB wrapped in the tiny
 * `SqlStorage` surface `Queries` actually uses (`.exec(sql, ...b).toArray()`).
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { handleToolCall } from "./mcp";
import { retrieve } from "./retrieval";
import { deriveTasteSignals } from "./taste/derive";
import type { ToolCallRequest } from "@shared/contract";

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

const HUMAN = "user_1";
const SPACE = "space-user_1";
const now = 1_000_000;

function seed(q: Queries) {
  q.insertSpace({ id: SPACE, name: "Archive", owner_id: HUMAN, kind: "personal", created_at: now });
  for (const [id, slug] of [
    ["r_work", "work"],
    ["r_insp", "inspiration"],
    ["r_pers", "personal"],
  ] as const) {
    q.insertRegion({ id, space_id: SPACE, parent_id: null, name: slug, slug, created_at: now });
  }
  const item = (id: string, region_id: string, title: string, text: string, dimensions: string[] = []) =>
    q.insertItem({
      id,
      space_id: SPACE,
      region_id,
      owner_id: HUMAN,
      type: "note",
      title,
      source_url: null,
      content_ref: null,
      semantic_text: text,
      metadata: dimensions.length ? { dimensions } : {},
      authority_class: "human_authored",
      created_by: HUMAN,
      created_at: now,
      updated_at: now,
    });
  item("i_brief", "r_work", "Spring brief", "warm editorial campaign, saturated accent colour");
  item("i_ref", "r_insp", "Editorial colour reference", "dense serif typography, generous colour palette", ["color"]);
  item("i_noise", "r_work", "Unrelated travel receipt", "hotel check-in and baggage claim details");
  item("i_secret", "r_pers", "Salary notes", "confidential personal compensation figures");

  q.insertTask({
    id: "t1",
    space_id: SPACE,
    human_id: HUMAN,
    title: "Spring campaign visual brief",
    instruction: "",
    status: "open",
    created_at: now,
    expires_at: null,
  });
  const grant = (region_id: string, level: "read" | "write") =>
    q.insertGrant({
      id: `g_${region_id}`,
      task_id: "t1",
      space_id: SPACE,
      region_id,
      level,
      grantor_id: HUMAN,
      created_at: now,
      expires_at: null,
      revoked_at: null,
      revoked_by: null,
      reason: null,
    });
  grant("r_work", "write");
  grant("r_insp", "read");
  // r_pers: no grant on purpose.

  q.insertAgentSession({ id: "sess1", human_id: HUMAN, task_id: "t1", declared: { client: "Claude" }, created_at: now });
}

const call = (q: Queries, tool: ToolCallRequest["tool"], input: Record<string, unknown>) =>
  handleToolCall({ tool, input, agent_session_id: "sess1", task_id: "t1" }, q, { human_id: HUMAN }, now + 1);

test("the full collaboration loop runs against a real schema", async () => {
  const q = makeQueries();
  seed(q);

  // 1. retrieval is permission pre-filtered — work + inspiration in, personal absent.
  const scoped = retrieve(q, { taskId: "t1", query: "colour", regionSlugs: null, limit: 10 }, now + 1);
  const gotRegions = new Set(scoped.map((r) => r.region_slug));
  expect(gotRegions.has("work")).toBe(true);
  expect(gotRegions.has("inspiration")).toBe(true);
  expect(scoped.some((r) => r.item.id === "i_noise")).toBe(false);
  expect(scoped.some((r) => r.item.id === "i_secret")).toBe(false);

  // naming the ungranted region is denied outright, not silently emptied.
  const denied = await call(q, "get_context_for_task", { region: "personal", query: "x" });
  expect(denied.ok).toBe(false);

  // 2. agent records an artifact, citing a real influence.
  const rec = await call(q, "record_artifact", {
    region: "work",
    title: "Spring hero v1",
    content_html: "<h1>Bloom</h1>",
    used_item_ids: ["i_brief"],
  });
  expect(rec.ok).toBe(true);
  const { artifact_id, version_id } = (rec as { result: { artifact_id: string; version_id: string } }).result;
  expect(q.listInfluences(version_id)).toHaveLength(1);

  // 3. human annotates with sentiment + dimension, then requests changes.
  for (const [id, comment] of [
    ["a1", "the colour palette reads flat and monochrome"],
    ["a2", "wanted a warmer, more saturated colour treatment"],
  ] as const) {
    q.insertAnnotation({
      id,
      version_id,
      author_id: HUMAN,
      target: null,
      sentiment: "negative",
      dimensions: ["color"],
      comment,
      status: "open",
      created_at: now + 2,
    });
  }
  q.insertDecision({
    id: "d1",
    version_id,
    actor_id: HUMAN,
    decision: "request_changes",
    note: null,
    prev_state: "ready_for_review",
    at: now + 2,
  });
  q.setArtifactVersionState(version_id, "changes_requested");

  // 3b. the person edits their own note — a new tag and reworded text stick.
  q.updateAnnotation("a1", { comment: "flat monochrome palette, no warmth", dimensions: ["color", "imagery"] });
  const edited = q.getAnnotation("a1")!;
  expect(edited.comment).toBe("flat monochrome palette, no warmth");
  expect(edited.dimensions).toEqual(["color", "imagery"]);

  // 4. taste derivation turns the grouped notes into a proposed signal with cited evidence.
  await deriveTasteSignals(q, SPACE, now + 3);
  const proposed = q.listTasteSignals(SPACE).filter((s) => s.status === "proposed");
  expect(proposed.length).toBeGreaterThanOrEqual(1);
  expect(proposed.some((s) => s.dimensions.includes("color"))).toBe(true);
  const colorSignal = proposed.find((s) => s.dimensions.includes("color"))!;
  expect(colorSignal.created_by).toBe("system");
  expect(q.listTasteEvidence(colorSignal.id).length).toBeGreaterThanOrEqual(2);

  // 5. the agent can read the feedback back through the tool.
  const trace = await call(q, "trace_artifact_influences", { version_id });
  expect(trace.ok).toBe(true);
  const traceRes = (trace as { result: { annotations: unknown[]; influences: unknown[] } }).result;
  expect(traceRes.annotations).toHaveLength(2);
  expect(traceRes.influences).toHaveLength(1);

  // 6. human confirms the signal.
  q.setTasteSignalStatus(colorSignal.id, "confirmed", HUMAN);
  const forAgent = await call(q, "get_taste_for_task", {});
  expect(forAgent.ok).toBe(true);
  const signals = (forAgent as { result: { signals: { status: string }[] } }).result.signals;
  expect(signals.some((s) => s.status === "confirmed")).toBe(true);

  // 7. retrieval now reflects the confirmed taste on a colour-relevant item.
  const withTaste = retrieve(q, { taskId: "t1", query: "colour", regionSlugs: null, limit: 10 }, now + 4);
  expect(withTaste.some((r) => r.applied_signal_ids.includes(colorSignal.id))).toBe(true);

  // 8. the agent submits a child revision chained to the reviewed version.
  const rev = await call(q, "record_artifact", {
    region: "work",
    title: "Spring hero v2",
    content_html: "<h1>Bloom, warmer</h1>",
    artifact_id,
    parent_version_id: version_id,
    used_item_ids: ["i_brief"],
  });
  expect(rev.ok).toBe(true);
  const v2 = q.latestArtifactVersion(artifact_id)!;
  expect(v2.version_no).toBe(2);
  expect(v2.parent_version_id).toBe(version_id);

  // a revision pointing at a foreign version is rejected.
  const bad = await call(q, "record_artifact", {
    region: "work",
    title: "bad",
    content_html: "<p>x</p>",
    artifact_id,
    parent_version_id: "nope",
    used_item_ids: [],
  });
  expect(bad.ok).toBe(false);
});
