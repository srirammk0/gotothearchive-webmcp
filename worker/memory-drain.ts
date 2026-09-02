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

/** Fetches the canonical file for an item's `content_ref`, or null. */
export type BlobFetcher = (key: string) => Promise<{ body: ReadableStream; contentType: string | null } | null>;

type Result = { docId: string | null };

function filenameFor(job: MemoryOutboxJob): string {
  const base = job.payload.title.replace(/[^\w.-]+/g, "_").slice(0, 60) || job.item_id;
  const ext = job.payload.file_type === "image" ? ".png" : job.payload.file_type === "pdf" ? ".pdf" : "";
  return base.endsWith(ext) ? base : base + ext;
}

async function handleJob(
  index: MemoryIndex,
  job: MemoryOutboxJob,
  getBlob: BlobFetcher | undefined,
): Promise<Result | null> {
  if (job.op === "delete") {
    const ok = await index.deleteDocument(job.doc_id ?? job.custom_id);
    return ok === null ? null : { docId: job.doc_id };
  }

  const metadata = {
    item_id: job.item_id,
    region_id: job.payload.region_id,
    authority_class: job.payload.authority_class,
  };

  // A file-backed item (image, PDF, doc): send the bytes so the index reads the
  // actual content, with the human's title/description as extra context. Fall
  // through to text if the blob can't be fetched.
  if (job.payload.content_ref && getBlob) {
    const blob = await getBlob(job.payload.content_ref);
    if (blob) {
      const ref = await index.addFile({
        file: await new Response(blob.body).blob(),
        filename: filenameFor(job),
        customId: job.custom_id,
        containerTag: job.container_tag,
        fileType: job.payload.file_type ?? undefined,
        mimeType: blob.contentType ?? undefined,
        entityContext: memoryContent(job.payload) || undefined,
        metadata,
      });
      return ref === null ? null : { docId: ref.id };
    }
  }

  const content = memoryContent(job.payload);
  if (content.length === 0) return { docId: job.doc_id }; // nothing to index; treat as done
  const ref = await index.addText({
    content,
    customId: job.custom_id, // Supermemory upserts by customId → re-sends are safe
    containerTag: job.container_tag,
    metadata,
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
  getBlob?: BlobFetcher,
): Promise<{ report: MemoryOutboxDrainReport; morePending: boolean }> {
  const report = await drainMemoryOutbox<MemoryOutboxJob, Result>({
    limit: BATCH,
    secrets,
    query: { listPending: (limit) => Promise.resolve(q.listPendingMemoryOps(limit)) },
    handle: (job) => handleJob(index, job, getBlob),
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
