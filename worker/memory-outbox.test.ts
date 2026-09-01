import { expect, test } from "bun:test";
import { drainMemoryOutbox, redactMemorySecret } from "./memory-outbox";

test("drain uses injected query/storage and makes no job-shape assumptions", async () => {
  const jobs = [{ opaque: 1 }, { opaque: 2 }, { opaque: 3 }];
  const completed: unknown[] = [];
  const retried: unknown[] = [];
  const failed: unknown[] = [];
  const report = await drainMemoryOutbox({
    query: {
      listPending: async (limit) => {
        expect(limit).toBe(2);
        return jobs;
      },
    },
    storage: {
      markCompleted: async (job, result) => completed.push([job, result]),
      markRetry: async (job, reason) => retried.push([job, reason]),
      markFailed: async (job, reason) => failed.push([job, reason]),
    },
    limit: 2,
    handle: async (job) => job.opaque === 1 ? "indexed" : null,
  });

  expect(report).toEqual({ claimed: 3, completed: 1, retried: 2, failed: 0 });
  expect(completed).toEqual([[jobs[0], "indexed"]]);
  expect(retried).toEqual([[jobs[1], "memory provider unavailable"], [jobs[2], "memory provider unavailable"]]);
  expect(failed).toEqual([]);
});

test("handler errors are failed with redacted reasons while other jobs continue", async () => {
  const failed: Array<[unknown, string]> = [];
  const report = await drainMemoryOutbox({
    query: { listPending: async () => ["bad", "good"] },
    storage: {
      markCompleted: async () => undefined,
      markRetry: async () => undefined,
      markFailed: async (job, reason) => failed.push([job, reason]),
    },
    handle: async (job) => {
      if (job === "bad") throw new Error("request failed: Bearer super-secret apiKey=also-secret");
      return { ok: true };
    },
  });

  expect(report).toEqual({ claimed: 2, completed: 1, retried: 0, failed: 1 });
  expect(failed).toEqual([["bad", "request failed: Bearer [REDACTED] apiKey=[REDACTED]"]]);
});

test("completion persistence failures remain retryable and are never marked terminal", async () => {
  const retried: Array<[unknown, string]> = [];
  const failed: unknown[] = [];
  const report = await drainMemoryOutbox({
    query: { listPending: async () => ["remote-success"] },
    storage: {
      markCompleted: async () => { throw new Error("database token=private-value unavailable"); },
      markRetry: async (job, reason) => retried.push([job, reason]),
      markFailed: async (job) => failed.push(job),
    },
    secrets: ["private-value"],
    handle: async () => ({ providerId: "remote_1" }),
  });

  expect(report).toEqual({ claimed: 1, completed: 0, retried: 1, failed: 0 });
  expect(retried).toEqual([["remote-success", "completion persistence failed: database token=[REDACTED] unavailable"]]);
  expect(failed).toEqual([]);
});

test("a failed retry persistence does not fall through to terminal failure", async () => {
  const failed: unknown[] = [];
  await expect(drainMemoryOutbox({
    query: { listPending: async () => ["remote-success"] },
    storage: {
      markCompleted: async () => { throw new Error("completion store unavailable"); },
      markRetry: async () => { throw new Error("retry store unavailable"); },
      markFailed: async (job) => failed.push(job),
    },
    handle: async () => "remote-result",
  })).rejects.toThrow("retry store unavailable");

  expect(failed).toEqual([]);
});

test("secret redaction also accepts explicit provider secrets", () => {
  expect(redactMemorySecret("token=abc and raw-key", ["raw-key"])).toBe("token=[REDACTED] and [REDACTED]");
});
