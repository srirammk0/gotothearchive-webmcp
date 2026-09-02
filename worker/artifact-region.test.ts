/**
 * record_artifact must not let the same artifact land in more than one
 * folder: a revision is placed against the artifact's own existing region,
 * never whatever `region` that particular call happens to send.
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
  q.insertRegion({ id: "r_b", space_id: SPACE, parent_id: null, name: "Folder B", slug: "folder-b", created_at: now });
  q.insertTask({ id: "t1", space_id: SPACE, human_id: HUMAN, title: "Task", instruction: "", status: "open", created_at: now, expires_at: null });
  const grant = (region_id: string, level: "read" | "write") =>
    q.insertGrant({
      id: `g_${region_id}`, task_id: "t1", space_id: SPACE, region_id, level,
      grantor_id: HUMAN, created_at: now, expires_at: null, revoked_at: null, revoked_by: null, reason: null,
    });
  grant("r_a", "write");
  grant("r_b", "write");
  q.insertAgentSession({ id: "sess1", human_id: HUMAN, task_id: "t1", declared: null, created_at: now });
}

const call = (q: Queries, input: Record<string, unknown>) =>
  handleToolCall(
    { tool: "record_artifact" as ToolCallRequest["tool"], input, agent_session_id: "sess1", task_id: "t1" },
    q,
    { human_id: HUMAN },
    now + 1,
  );

test("a new artifact's region_id is set from the creating call", async () => {
  const q = makeQueries();
  seed(q);
  const rec = await call(q, { region: "folder-a", title: "Brief", content_html: "<p>v1</p>" });
  expect(rec.ok).toBe(true);
  const { artifact_id } = (rec as { result: { artifact_id: string } }).result;
  expect(q.getArtifact(artifact_id)?.region_id).toBe("r_a");
});

test("revising with a different region does not move the artifact", async () => {
  const q = makeQueries();
  seed(q);
  const rec = await call(q, { region: "folder-a", title: "Brief", content_html: "<p>v1</p>" });
  const { artifact_id, version_id } = (rec as { result: { artifact_id: string; version_id: string } }).result;

  const rev = await call(q, {
    region: "folder-b", // different folder, same agent has write access to both
    title: "Brief",
    content_html: "<p>v2</p>",
    artifact_id,
    parent_version_id: version_id,
  });

  expect(rev.ok).toBe(true);
  // Still in its original folder — the revision's `region` input was ignored for placement.
  expect(q.getArtifact(artifact_id)?.region_id).toBe("r_a");
  const v2 = q.latestArtifactVersion(artifact_id);
  expect(v2?.content_html).toContain('content="r_a"');
  expect(v2?.content_html).not.toContain('content="r_b"');
});

test("revising after the artifact's own region access is revoked is denied, even with access elsewhere", async () => {
  const q = makeQueries();
  seed(q);
  const rec = await call(q, { region: "folder-a", title: "Brief", content_html: "<p>v1</p>" });
  const { artifact_id, version_id } = (rec as { result: { artifact_id: string; version_id: string } }).result;

  q.revokeGrant("g_r_a", HUMAN, null, now + 1); // pull write access to the artifact's real folder
  // The agent still has write on folder-b, but that must not matter — the
  // artifact's home is folder-a, and that grant is what's checked.
  const rev = await call(q, {
    region: "folder-b",
    title: "Brief",
    content_html: "<p>v2</p>",
    artifact_id,
    parent_version_id: version_id,
  });

  expect(rev.ok).toBe(false);
  // Nothing moved and no second version landed.
  expect(q.getArtifact(artifact_id)?.region_id).toBe("r_a");
  expect(q.latestArtifactVersion(artifact_id)?.id).toBe(version_id);
});
