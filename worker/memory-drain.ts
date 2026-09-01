/**
 * Drains memory_outbox into the external memory index (Supermemory).
 *
 * Supermemory is a retrieval *augmentation* — a stuck or failed job only means
 * an item stays FTS-only until the next drain. It never gates access, so this
 * whole path is best-effort: it must never throw out of SpaceDO.alarm().
 */
import { drainMemoryOutbox, type MemoryOutboxDrainReport } from "./memory-outbox";
import type { MemoryIndex } from "./memory-index";
import { createSupermemoryMemoryIndex } from "./memory-supermemory";
import type { MemoryOutboxJob, MemoryOutboxPayload, Queries } from "./db/queries";

const MAX_ATTEMPTS = 5;
const BATCH = 25;

/** null when SUPERMEMORY_API_KEY is unset — every caller then degrades to SQLite-only. */
export function memoryIndexFor(env: Env): MemoryIndex | null {
  const apiKey = env.SUPERMEMORY_API_KEY?.trim();
  return apiKey ? createSupermemoryMemoryIndex({ apiKey }) : null;
}

/** One line of searchable text per item. Title first, then any derived body. */
export function memoryContent(payload: MemoryOutboxPayload): string {
  return [payload.title, payload.semantic_text ?? ""].join("\n").trim();
}

type Result = { docId: string | null };

async function handleJob(index: MemoryIndex, job: MemoryOutboxJob): Promise<Result | null> {
  if (job.op === "delete") {
    const ok = await index.deleteDocument(job.doc_id ?? job.custom_id);
    return ok === null ? null : { docId: job.doc_id };
  }
  const content = memoryContent(job.payload);
  if (content.length === 0) return { docId: job.doc_id }; // nothing to index; treat as done
  const ref = await index.addText({
    content,
    customId: job.custom_id, // Supermemory upserts by customId → re-sends are safe
    containerTag: job.container_tag,
    metadata: {
      item_id: job.item_id,
      region_id: job.payload.region_id,
      authority_class: job.payload.authority_class,
    },
  });
  return ref === null ? null : { docId: ref.id };
}

/**
 * Drain one batch. Returns the report plus whether more pending work remains so
 * the caller can decide to re-arm the alarm.
 */
export async function drainSpaceMemory(
  q: Queries,
  index: MemoryIndex,
  secrets: readonly string[],
): Promise<{ report: MemoryOutboxDrainReport; morePending: boolean }> {
  const report = await drainMemoryOutbox<MemoryOutboxJob, Result>({
    limit: BATCH,
    secrets,
    query: { listPending: (limit) => Promise.resolve(q.listPendingMemoryOps(limit)) },
    handle: (job) => handleJob(index, job),
    storage: {
      markCompleted: (job, result) => {
        q.markMemoryOpDone(job.id, result.docId, Date.now());
        return Promise.resolve();
      },
      markRetry: (job, reason) => {
        q.markMemoryOpRetry(job.id, reason, MAX_ATTEMPTS, Date.now());
        return Promise.resolve();
      },
      markFailed: (job, reason) => {
        q.markMemoryOpFailed(job.id, reason, Date.now());
        return Promise.resolve();
      },
    },
  });
  return { report, morePending: q.countPendingMemoryOps() > 0 };
}
