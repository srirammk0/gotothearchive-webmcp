/** Generic outbox draining; callers own the row shape and persistence semantics. */

export interface MemoryOutboxQuery<Job> {
  listPending(limit: number): Promise<readonly Job[]>;
}

export interface MemoryOutboxStorage<Job, Result> {
  markCompleted(job: Job, result: Result): Promise<void>;
  markRetry(job: Job, reason: string): Promise<void>;
  markFailed(job: Job, reason: string): Promise<void>;
}

export interface MemoryOutboxDrainInput<Job, Result> {
  query: MemoryOutboxQuery<Job>;
  storage: MemoryOutboxStorage<Job, Result>;
  handle: (job: Job) => Promise<Result | null>;
  limit?: number;
  secrets?: readonly string[];
}

export interface MemoryOutboxDrainReport {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
}

const DEFAULT_BATCH_SIZE = 25;
const MAX_REASON_LENGTH = 500;

/** Redacts common bearer/query secrets before an error can enter durable storage. */
export function redactMemorySecret(message: string, secrets: readonly string[] = []): string {
  let redacted = message;
  for (const secret of secrets) {
    if (secret.length > 0) redacted = redacted.split(secret).join("[REDACTED]");
  }
  redacted = redacted.replace(/(Bearer\s+)[^\s,;]+/gi, "$1[REDACTED]");
  redacted = redacted.replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^&\s,;]+/gi, "$1[REDACTED]");
  return redacted.slice(0, MAX_REASON_LENGTH);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "memory outbox handler failed";
}

function batchSize(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_BATCH_SIZE;
}

/**
 * Drains a claimed batch in order. A null handler result is provider
 * unavailability and remains retryable; thrown handler errors are terminal for
 * that job. Completion persistence errors are also retryable: the remote work
 * has already happened, so marking the job failed could lose that work's
 * result. Query and storage implementations decide how claims are leased.
 */
export async function drainMemoryOutbox<Job, Result>(
  input: MemoryOutboxDrainInput<Job, Result>,
): Promise<MemoryOutboxDrainReport> {
  const jobs = await input.query.listPending(batchSize(input.limit));
  const report: MemoryOutboxDrainReport = {
    claimed: jobs.length,
    completed: 0,
    retried: 0,
    failed: 0,
  };

  for (const job of jobs) {
    let result: Result | null;
    try {
      result = await input.handle(job);
    } catch (error) {
      await input.storage.markFailed(job, redactMemorySecret(errorMessage(error), input.secrets));
      report.failed += 1;
      continue;
    }

    if (result === null) {
      await input.storage.markRetry(job, "memory provider unavailable");
      report.retried += 1;
      continue;
    }

    try {
      await input.storage.markCompleted(job, result);
      report.completed += 1;
    } catch (error) {
      // The remote operation succeeded. Keep the job non-terminal so a later
      // drain can safely retry completion persistence without reclassifying it
      // as a permanent handler failure.
      const reason = redactMemorySecret(
        `completion persistence failed: ${errorMessage(error)}`,
        input.secrets,
      );
      await input.storage.markRetry(job, reason);
      report.retried += 1;
    }
  }

  return report;
}
