import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { migrate } from "./migrate";

/** bun:sqlite as a single-statement SqlStorage shim (matches migrate()'s usage). */
function shim(db: Database): SqlStorage {
  return {
    exec: (query: string, ...bindings: unknown[]) => {
      const rows = db.query(query).all(...(bindings as never[]));
      return { toArray: () => rows };
    },
  } as unknown as SqlStorage;
}

const currentSchema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

/** schema.sql as it was before `projects` existed: no project_id columns, no projects tables. */
const preProjectsSchema = currentSchema
  .replace(/CREATE TABLE IF NOT EXISTS projects \([\s\S]*?\);/g, "")
  .replace(/CREATE TABLE IF NOT EXISTS project_members \([\s\S]*?\);/g, "")
  .replace(/CREATE INDEX IF NOT EXISTS idx_projects[^\n]*\n/g, "")
  .replace(/CREATE INDEX IF NOT EXISTS idx_project_members[^\n]*\n/g, "")
  .replace(/^\s*project_id\s+TEXT REFERENCES projects\(id\),\n/gm, "")
  .replace(/^\s*supersedes\s+TEXT REFERENCES taste_signals\(id\)\n/gm, "  supersedes  TEXT\n");

test("a DO created before project_id boots cleanly through schema + migrate", () => {
  const db = new Database(":memory:");
  db.run(preProjectsSchema); // old durable state

  // Deploy: the current schema is re-applied (CREATE TABLE IF NOT EXISTS skips
  // the pre-existing tasks/taste_signals), then migrate() runs. This is the
  // exact sequence SpaceDO's constructor performs, and the sequence that used
  // to throw "no such column: project_id" on the index in schema.sql.
  expect(() => db.run(currentSchema)).not.toThrow();
  expect(() => migrate(shim(db))).not.toThrow();

  const taskCols = db.query("PRAGMA table_info(tasks)").all() as { name: string }[];
  expect(taskCols.some((c) => c.name === "project_id")).toBe(true);
  const signalCols = db.query("PRAGMA table_info(taste_signals)").all() as { name: string }[];
  expect(signalCols.some((c) => c.name === "project_id")).toBe(true);

  const taskIdx = db.query("PRAGMA index_list(tasks)").all() as { name: string }[];
  expect(taskIdx.some((i) => i.name === "idx_tasks_project")).toBe(true);

  // Idempotent: a second boot must not throw.
  expect(() => migrate(shim(db))).not.toThrow();
});

test("a fresh DO boots cleanly through schema + migrate", () => {
  const db = new Database(":memory:");
  db.run(currentSchema);
  expect(() => migrate(shim(db))).not.toThrow();
});
